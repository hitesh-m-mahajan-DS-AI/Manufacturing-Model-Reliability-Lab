"""Single-origin localhost API. No authentication: intended for one user's laptop."""
from contextlib import asynccontextmanager
import csv
import io
import json
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from .data import ROOT
from .service import Lab, LabError


class ReleaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1, max_length=80)
    expected_generation: int = Field(ge=1)


class RollbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_generation: int = Field(ge=1)


class ReplayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shifted: bool = False
    labels: bool = True


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    targeted_productivity: float = Field(ge=0, le=1)
    smv: float = Field(gt=0, le=100)
    no_of_workers: float = Field(gt=0, le=200)
    department: Literal["sewing", "finishing"]


def create_app(runtime=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.lab = Lab(runtime)
        yield

    app = FastAPI(title="Manufacturing Model Reliability Lab", lifespan=lifespan)

    @app.exception_handler(LabError)
    async def lab_error(request: Request, exc: LabError):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.get("/api/health")
    def health():
        return {"status": "ok", "active": app.state.lab.store.state()}

    @app.get("/api/lab")
    def snapshot():
        return app.state.lab.snapshot()

    @app.post("/api/train")
    def train():
        return app.state.lab.train_new()

    @app.post("/api/release")
    def release(body: ReleaseRequest):
        return app.state.lab.release(body.version, body.expected_generation)

    @app.post("/api/rollback")
    def rollback(body: RollbackRequest):
        return app.state.lab.release(None, body.expected_generation, rollback=True)

    @app.post("/api/predict")
    def predict(body: PredictionRequest):
        return app.state.lab.predict(body.model_dump())

    @app.post("/api/replay")
    def replay(body: ReplayRequest):
        return app.state.lab.replay(body.shifted, body.labels)

    @app.get("/api/export/audit")
    def export_audit():
        return Response(json.dumps(app.state.lab.snapshot(), indent=2), media_type="application/json",
                        headers={"Content-Disposition": 'attachment; filename="model-audit.json"'})

    @app.get("/api/replays/{replay_id}/export/{format}")
    def export_replay(replay_id: str, format: Literal["json", "csv", "md"]):
        result = app.state.lab.replay_by_id(replay_id)
        if format == "json":
            content, media = json.dumps(result, indent=2), "application/json"
        elif format == "csv":
            stream = io.StringIO(newline="")
            writer = csv.DictWriter(stream, fieldnames=["model_version", "source_row", "date", "prediction", "actual"])
            writer.writeheader()
            writer.writerows({"model_version": result["model_version"], **row} for row in result["predictions"])
            content, media = stream.getvalue(), "text/csv"
        else:
            content = f"# Historical replay brief\n\nModel: {result['model_version']}\n\nRows: {result['rows']}\n\nSynthetic input shift: {result['synthetic_shift']}\n\nObserved errors: {result['metrics'] or 'Unavailable; no valid labels'}\n\n{result['interpretation']}\n\n{result['scope']}\n"
            media = "text/markdown"
        return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{replay_id}.{format}"'})

    dist = ROOT / "frontend/dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="interface")
    return app


app = create_app()
