.PHONY: run test unit lint types check load agent-push
run:        ; uvicorn app.main:app --reload --port 8000
unit:       ; python -m unittest -v
test:       ; python -m pytest -q
lint:       ; ruff check app tests
types:      ; mypy app
check:      lint types test
load:       ; locust -f load/locustfile.py --host http://localhost:8000
agent-push: ; cd agent && elevenlabs agents push --dry-run
