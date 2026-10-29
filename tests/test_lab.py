"""Meaningful lifecycle checks; real small models and a temporary local MLflow store."""
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import backend  # Configure local-only tracking before importing MLflow.
from fastapi.testclient import TestClient
from mlflow.tracking import MlflowClient
from backend.api import create_app
from backend.data import ROOT, FEATURES, TARGET, load_data, load_policy, partition
from backend.monitoring import psi, monitor
from backend.service import Lab, LabError
from backend.training import load_model, release_checks


class LifecycleChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(dir=ROOT / "runtime")
        cls.lab = Lab(cls.temp.name)
        cls.experiment = cls.lab.store.experiments()[0]
        cls.baseline, cls.ridge, cls.forest = cls.experiment["models"]

    @classmethod
    def tearDownClass(cls):
        # MLflow caches a SQLAlchemy connection pool; release it before Windows cleanup.
        from mlflow.store.tracking.sqlalchemy_store import SqlAlchemyStore
        for engine in SqlAlchemyStore._engine_map.values():
            engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        with self.lab.store.connect() as db:
            db.execute("UPDATE state SET active=?,previous=NULL,generation=1 WHERE id=1", (self.baseline["version"],))

    def test_source_and_date_boundaries(self):
        train, validation, replay = partition(load_data(), load_policy())
        self.assertEqual([len(x) for x in [train,validation,replay]], [711,232,254])
        self.assertLess(train.date.max(), validation.date.min())
        self.assertLess(validation.date.max(), replay.date.min())
        self.assertEqual(FEATURES, ["targeted_productivity","smv","no_of_workers","department"])
        self.assertNotIn(TARGET, FEATURES)

    def test_preprocessing_fits_training_only(self):
        model = load_model(self.lab.runtime, self.forest)
        np.testing.assert_allclose(model.named_steps['features'].named_transformers_['numeric'].mean_, self.lab.train[FEATURES[:3]].mean())
        self.assertEqual(model.named_steps['model'].random_state, 42)

    def test_failed_quality_gate_is_not_eligible(self):
        checks = release_checks('forest', {'mae':.3}, [{'mae':.4,'rows':5}], .15, True, load_policy())
        self.assertFalse(all(c['passed'] for c in checks))
        self.assertEqual(sum(not c['passed'] for c in checks), 4)

    def test_gate_rejection_preserves_active_pointer(self):
        experiment = self.lab.store.experiments()[0]
        original = json.dumps(experiment)
        experiment['models'][2]['eligible'] = False
        with self.lab.store.connect() as db:
            db.execute("UPDATE experiments SET payload=? WHERE id=?", (json.dumps(experiment),experiment['id']))
        try:
            with self.assertRaisesRegex(LabError, 'Release blocked'):
                self.lab.release(self.forest['version'], 1)
            self.assertEqual(self.lab.store.state()['generation'],1)
        finally:
            with self.lab.store.connect() as db:
                db.execute("UPDATE experiments SET payload=? WHERE id=?", (original,experiment['id']))

    def test_tampered_artifact_cannot_release(self):
        path = self.lab.runtime / self.forest['artifact']
        original = path.read_bytes()
        try:
            path.write_bytes(original + b'fault')
            with self.assertRaisesRegex(LabError,'integrity'):
                self.lab.release(self.forest['version'],1)
            self.assertEqual(self.lab.store.state()['active'],self.baseline['version'])
        finally:
            path.write_bytes(original)

    def test_stale_generation_rejected(self):
        with self.assertRaisesRegex(LabError,'State changed'):
            self.lab.release(self.forest['version'],99)
        self.assertEqual(self.lab.store.state()['generation'],1)

    def test_release_and_rollback_restore_prediction_and_identity(self):
        inputs = {'targeted_productivity':.8,'smv':26,'no_of_workers':56,'department':'sewing'}
        before = self.lab.predict(inputs)
        self.lab.release(self.forest['version'],1)
        after = self.lab.predict(inputs)
        self.assertEqual(after['model_version'],self.forest['version'])
        self.assertNotEqual(before['prediction'],after['prediction'])
        self.lab.release(None,2,rollback=True)
        restored = self.lab.predict(inputs)
        self.assertEqual(restored['prediction'],before['prediction'])
        self.assertEqual(restored['model_version'],before['model_version'])
        self.assertEqual(restored['generation'],3)

    def test_shift_has_no_counterfactual_error_score(self):
        model = load_model(self.lab.runtime,self.forest)
        result = monitor(self.lab.train,self.lab.replay_data,model,self.lab.policy,shifted=True,labels=True)
        self.assertIsNone(result['metrics'])
        self.assertFalse(result['labels_available'])
        self.assertTrue(all(p['actual'] is None for p in result['predictions']))
        self.assertAlmostEqual(psi(self.lab.train.smv,self.lab.train.smv),0)
        self.assertTrue(np.isfinite([d['psi'] for d in result['drift']]).all())

    def test_labels_can_be_withheld_on_unchanged_replay(self):
        model = load_model(self.lab.runtime,self.forest)
        result = monitor(self.lab.train,self.lab.replay_data,model,self.lab.policy,labels=False)
        self.assertIsNone(result['metrics'])
        self.assertEqual(result['rows'],254)

    def test_mlflow_has_real_metrics_and_artifacts(self):
        client = MlflowClient(tracking_uri=self.experiment['tracking_uri'])
        run = client.get_run(self.forest['mlflow_run_id'])
        self.assertAlmostEqual(run.data.metrics['validation_mae'],self.forest['validation']['mae'])
        self.assertEqual(run.info.status,'FINISHED')
        self.assertEqual({a.path for a in client.list_artifacts(run.info.run_id)}, {'forest.joblib','forest_validation.json'})

    def test_api_validation_state_export_and_restart(self):
        inputs = {'targeted_productivity':.8,'smv':26,'no_of_workers':56,'department':'sewing'}
        with TestClient(create_app(self.lab.runtime)) as client:
            self.assertEqual(client.post('/api/predict',json={**inputs,'smv':-2}).status_code,422)
            self.assertEqual(client.post('/api/predict',json={**inputs,'actual_productivity':.9}).status_code,422)
            self.assertEqual(client.post('/api/predict',json={**inputs,'department':'unknown'}).status_code,422)
            self.assertEqual(client.post('/api/release',json={'version':self.forest['version'],'expected_generation':99}).status_code,409)
            self.assertEqual(client.post('/api/release',json={'version':self.forest['version'],'expected_generation':1}).status_code,200)
            replay = client.post('/api/replay',json={'labels':False}).json()
            self.assertIsNone(replay['metrics'])
            self.assertEqual(client.get(f"/api/replays/{replay['id']}/export/csv").status_code,200)
            self.assertEqual(client.get('/api/replays/missing/export/json').status_code,404)
            self.assertEqual(client.get('/api/export/audit').status_code,200)
        with TestClient(create_app(self.lab.runtime)) as restarted:
            state = restarted.get('/api/health').json()['active']
            self.assertEqual(state['active'],self.forest['version'])
            self.assertEqual(restarted.post('/api/predict',json=inputs).json()['model_version'],self.forest['version'])


if __name__ == '__main__':
    unittest.main()
