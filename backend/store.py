"""One local transaction updates the active version and appends its audit event."""
from contextlib import contextmanager
import json
import sqlite3
from .training import now


class Store:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY, created TEXT, payload TEXT);
            CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), active TEXT, previous TEXT, generation INTEGER);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, created TEXT, action TEXT, payload TEXT);
            CREATE TABLE IF NOT EXISTS replays(id TEXT PRIMARY KEY, created TEXT, payload TEXT);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def event(self, db, action, payload):
        db.execute("INSERT INTO events(created,action,payload) VALUES(?,?,?)", (now(), action, json.dumps(payload)))

    def state(self):
        with self.connect() as db:
            row = db.execute("SELECT * FROM state WHERE id=1").fetchone()
        return dict(row) if row else {"active": None, "previous": None, "generation": 0}

    def experiments(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute("SELECT payload FROM experiments ORDER BY created DESC")]

    def events(self):
        with self.connect() as db:
            return [{**dict(row), "payload": json.loads(row["payload"])} for row in db.execute("SELECT * FROM events ORDER BY id DESC LIMIT 100")]

    def replays(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute("SELECT payload FROM replays ORDER BY created DESC LIMIT 100")]
