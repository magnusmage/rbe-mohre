"""The web console is the only caller UI: the home page serves the built
console when web/dist exists and build instructions otherwise (never an
old page). Both branches are covered across environments: CI has no build,
a deployed checkout does.
"""
from fastapi.testclient import TestClient

from app.main import WEB_DIST, app

client = TestClient(app)
CONSOLE_BUILT = (WEB_DIST / "index.html").is_file()


def test_home_page_serves_console_or_instructions():
    r = client.get("/")
    assert r.status_code == 200
    if CONSOLE_BUILT:
        assert "RBE Console" in r.text
    else:
        assert "Console build missing" in r.text


def test_console_client_routes():
    for path in ("/caller/ready", "/specialist/RV-2409-0031"):
        r = client.get(path)
        if CONSOLE_BUILT:
            assert r.status_code == 200 and "RBE Console" in r.text
        else:
            assert r.status_code == 404


def test_reviewer_page_still_served():
    r = client.get("/review")
    assert r.status_code == 200
    assert "Specialist review queue" in r.text
