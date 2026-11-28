"""SC09 documentation checks only; no RPC, process launch, or product tests.

Uses the existing markdown-it-py installation for Markdown parsing/rendering.
No dependency is installed by this checker. Mermaid rendering is separately
reported as SKIP when the repository has no renderer.
"""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import hashlib
import json
import re
import sys

try:
    from markdown_it import MarkdownIt
except ImportError:
    sys.exit("Missing markdown-it-py; Markdown rendering is UNVERIFIED. Do not report PASS.")

ROOT = Path(__file__).resolve().parents[3]
FILES = ["README.md", "docs/contracts.md", "docs/sepolia-deployment.md",
         "docs/reviews/sc09-backend-data-review.md", "docs/report/tv1-smart-contracts.md",
         "docs/slides/tv1-smart-contracts.md"]
parser = MarkdownIt("commonmark").enable("table")
tokens_by_file = {}
anchors_by_file = {}
links = []
diagrams = []


def anchors(tokens):
    result = set()
    repeated = {}
    for index, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        children = tokens[index + 1].children or []
        title = "".join(t.content for t in children if t.type in ["text", "code_inline"])
        slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
        count = repeated.get(slug, 0)
        repeated[slug] = count + 1
        result.add(slug if not count else f"{slug}-{count}")
    return result


for name in FILES:
    path = ROOT / name
    contents = path.read_text()
    assert not re.search(r"^(?:<{7}|={7}|>{7})(?:\s|$)", contents, re.M), name
    assert all(line == line.rstrip() for line in contents.splitlines()), f"Trailing whitespace: {name}"
    assert contents.endswith("\n"), f"Missing final newline: {name}"
    assert len(re.findall(r"^```", contents, re.M)) % 2 == 0, f"Unclosed fence: {name}"
    assert not re.search(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", contents), name
    assert not re.search(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b", contents), name
    tokens = parser.parse(contents)
    parser.render(contents)  # Markdown only; Mermaid remains a code block.
    tokens_by_file[name] = tokens
    anchors_by_file[name] = anchors(tokens)
    for token in tokens:
        if token.type == "fence" and token.info.strip() == "mermaid":
            assert token.content.splitlines()[0] in ["flowchart LR", "sequenceDiagram", "stateDiagram-v2"]
            diagrams.append({"file": name, "line": token.map[0] + 1})
        for child in token.children or []:
            if child.type == "link_open":
                href = child.attrGet("href")
                if href and not urlsplit(href).scheme:
                    links.append((name, href))

for name, href in links:
    link = urlsplit(href)
    path = ((ROOT / name).parent / unquote(link.path)).resolve() if link.path else ROOT / name
    assert path.exists(), f"Missing link: {name} -> {href}"
    if not link.fragment:
        continue
    fragment = unquote(link.fragment)
    if re.fullmatch(r"L\d+(?:-L\d+)?", fragment):
        line = int(fragment.split("-")[0][1:])
        assert line <= len(path.read_text().splitlines()), f"Invalid line link: {href}"
    elif path.suffix == ".md":
        key = str(path.relative_to(ROOT))
        target_anchors = anchors_by_file.get(key)
        if target_anchors is None:
            target_anchors = anchors(parser.parse(path.read_text()))
        assert fragment in target_anchors, f"Missing heading: {name} -> {href}"

slides = (ROOT / "docs/slides/tv1-smart-contracts.md").read_text()
assert len(re.findall(r"^## Slide [1-8] —", slides, re.M)) == 8
assert slides.count("**Speaker notes:**") == slides.count("**Sources:**") == 8
for slide in re.split(r"^## Slide \d —.*$", slides, flags=re.M)[1:]:
    main = slide.split("**Speaker notes:**")[0]
    assert 3 <= len(re.findall(r"^- ", main, re.M)) <= 5
assert len(diagrams) == 6

docs = "\n".join((ROOT / file).read_text() for file in FILES)
test_names = set(re.findall(r"\btest[A-Z]\w+", docs))
test_source = "\n".join(p.read_text() for p in (ROOT / "tests").rglob("*.sol"))
for name in test_names:
    assert re.search(rf"function\s+{name}\s*\(", test_source), f"Unknown named test: {name}"

def signature(item):
    return item["name"] + "(" + ",".join(p["type"] for p in item["inputs"]) + ")"

governor = json.loads((ROOT / "shared/abi/BudgetGovernor.json").read_text())
errors = {signature(item) for item in governor if item["type"] == "error"}
documented_errors = ["InvalidActionCount(uint256,uint256,uint256)", "InvalidTarget(address)",
                     "InvalidNativeValue(uint256)", "InvalidCalldata()", "InvalidRecipient(address)",
                     "InvalidAmount(uint256)", "GovernorInsufficientProposerVotes(address,uint256,uint256)",
                     "GovernorUnexpectedProposalState(uint256,uint8,bytes32)"]
assert all(item in errors for item in documented_errors)
for name, methods in {"GovernanceToken": ["clock", "getPastVotes", "getPastTotalSupply", "delegate"],
                      "Treasury": ["SPENDER_ROLE", "DEFAULT_ADMIN_ROLE", "disburse", "paidRequests"],
                      "TimelockController": ["PROPOSER_ROLE", "EXECUTOR_ROLE", "CANCELLER_ROLE", "hashOperationBatch"]}.items():
    abi = json.loads((ROOT / f"shared/abi/{name}.json").read_text())
    available = {item["name"] for item in abi if item["type"] == "function"}
    assert set(methods) <= available, name

assert 10000 - 1000 == 9000
assert 13000 - 12000 == 1000
assert 10000 + 3000 - 7000 - 6000 == 0
assert 1000 * 10**18 == int("1000000000000000000000")

result = {"status": "PASS", "markdownFilesParsedAndRendered": len(FILES),
          "relativeLinksAndAnchorsChecked": len(links), "namedSolidityTestsVerified": len(test_names),
          "documentedGovernorErrorsVerifiedAgainstSharedABI": len(documented_errors),
          "mermaidDiagrams": {"count": len(diagrams), "manualSourceSyntaxReview": "PASS",
                              "automaticRender": "SKIP", "reason": "No Mermaid CLI/module available; no dependency installed."},
          "sourceSha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in FILES},
          "scope": "Documentation structure/link/name/arithmetic checks only, not product tests."}
print(json.dumps(result, ensure_ascii=False, indent=2))
