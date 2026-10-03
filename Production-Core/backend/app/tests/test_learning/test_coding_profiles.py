import httpx
import pytest

from backend.app.learning import coding_profiles as cp


def test_handles_are_validated_and_empty_values_drop_out():
    assert cp.clean_handles({"github": "@octocat", "leetcode": ""}) == {"github": "octocat"}
    for bad in ({"github": "-bad-"}, {"codeforces": "a b"}, {"myspace": "x"}):
        with pytest.raises(cp.ProfileError):
            cp.clean_handles(bad)


def _client(routes):
    def handler(req: httpx.Request) -> httpx.Response:
        for (method, host), resp in routes.items():
            if req.method == method and req.url.host == host:
                return resp(req)
        return httpx.Response(500)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def fresh_cache():
    cp._cache.clear()


async def test_live_stats_are_read_from_each_platform():
    routes = {
        ("GET", "api.github.com"): lambda r: httpx.Response(200, json={"public_repos": 12, "followers": 3, "created_at": "2021-04-01T00:00:00Z"}),
        ("POST", "leetcode.com"): lambda r: httpx.Response(200, json={"data": {"matchedUser": {"profile": {"ranking": 4567},
            "submitStats": {"acSubmissionNum": [{"difficulty": "All", "count": 150}, {"difficulty": "Easy", "count": 80},
                                                {"difficulty": "Medium", "count": 60}, {"difficulty": "Hard", "count": 10}]}}}}),
        ("GET", "codeforces.com"): lambda r: httpx.Response(200, json={"status": "OK", "result": [{"rating": 1432, "maxRating": 1510, "rank": "specialist"}]}),
    }
    async with _client(routes) as c:
        out = await cp.cards({"github": "octocat", "leetcode": "ada", "codeforces": "tourist", "codechef": "chef_1"}, client=c)
    by = {x["platform"]: x for x in out}
    assert [s["value"] for s in by["github"]["stats"]] == [12, 3, "2021"]
    assert by["leetcode"]["stats"][0] == {"label": "Solved", "value": 150} and by["leetcode"]["stats"][-1]["value"] == 4567
    assert by["codeforces"]["stats"][0]["value"] == 1432
    assert by["codechef"]["ok"] and by["codechef"]["stats"] == [] and "link" in by["codechef"]["note"]


async def test_unknown_users_and_outages_are_reported_not_invented():
    routes = {
        ("GET", "api.github.com"): lambda r: httpx.Response(404),
        ("POST", "leetcode.com"): lambda r: httpx.Response(200, json={"data": {"matchedUser": None}}),
        ("GET", "codeforces.com"): lambda r: httpx.Response(503),
    }
    async with _client(routes) as c:
        out = {x["platform"]: x for x in await cp.cards({"github": "nobody-here", "leetcode": "nobody", "codeforces": "nobody"}, client=c)}
    assert not out["github"]["ok"] and "No GitHub user" in out["github"]["note"]
    assert not out["leetcode"]["ok"]
    assert not out["codeforces"]["ok"] and out["codeforces"]["stats"] == []


async def test_results_are_cached():
    calls = {"n": 0}
    def gh(r):
        calls["n"] += 1
        return httpx.Response(200, json={"public_repos": 1, "followers": 1, "created_at": "2020"})
    async with _client({("GET", "api.github.com"): gh}) as c:
        await cp.cards({"github": "octocat"}, client=c)
        await cp.cards({"github": "octocat"}, client=c)
        await cp.cards({"github": "octocat"}, client=c, force=True)          # forced, but within a minute: still cached
    assert calls["n"] == 1


def test_profile_urls_are_accepted_and_wrong_sites_rejected():
    from backend.app.learning.coding_profiles import ProfileError, clean_handles
    out = clean_handles({"github": "https://github.com/octocat/", "leetcode": "https://leetcode.com/u/neal_wu/",
                         "codeforces": "codeforces.com/profile/tourist", "codechef": "@gennady"})
    assert out == {"github": "octocat", "leetcode": "neal_wu", "codeforces": "tourist", "codechef": "gennady"}
    with pytest.raises(ProfileError):
        clean_handles({"github": "https://gitlab.com/octocat"})


async def test_verification_reads_the_public_profile():
    from backend.app.learning.coding_profiles import verification_code, verify
    code = verification_code("s3cret", "u1", "github", "octocat")
    assert code.startswith("kiddoo-") and code == verification_code("s3cret", "u1", "github", "OctoCat")
    assert code != verification_code("s3cret", "u2", "github", "octocat")

    def handler(bio, readme=""):
        def reply(req):
            if req.url.path.endswith("/readme"):
                return httpx.Response(200 if readme else 404, text=readme)
            return httpx.Response(200, json={"bio": bio, "name": "Octo"})
        return httpx.MockTransport(reply)
    async with httpx.AsyncClient(transport=handler("", f"# Hi {code}")) as c:
        assert (await verify("github", "octocat", code, c))["verified"]          # the profile README counts too
    async with httpx.AsyncClient(transport=handler(f"I code. {code}")) as c:
        assert (await verify("github", "octocat", code, c))["verified"]
    async with httpx.AsyncClient(transport=handler("no code here")) as c:
        r = await verify("github", "octocat", code, c)
        assert not r["verified"] and "GitHub Bio" in r["reason"]


def test_appearance_prefs_are_validated_and_merged():
    from backend.app.learning import prefs
    out = prefs.clean_prefs({"ui": {"theme": "dark", "text_size": 110, "petals": False}})
    assert out["ui"] == {"theme": "dark", "text_size": 110, "petals": False, "motion": "full", "contrast": False}
    with pytest.raises(prefs.PrefsError):
        prefs.clean_prefs({"ui": {"text_size": 300}})
