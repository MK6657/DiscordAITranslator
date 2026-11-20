"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const artifact = "DiscordAITranslator.plugin.js";
const npmCli = [
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")
].filter(Boolean).find(candidate => fs.existsSync(candidate));

function createReleaseFixture(t) {
    assert.ok(npmCli, "npm-cli.js is required for the release-gate fixture");
    const tempRoot = fs.realpathSync(os.tmpdir());
    const directory = fs.mkdtempSync(path.join(tempRoot, "dait-release-audit-"));
    t.after(() => {
        assert.equal(path.dirname(directory), tempRoot);
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
        if (/^(?:GIT|GITHUB|NPM)_/i.test(name)) delete env[name];
    }
    const pathKey = Object.keys(env).find(name => name.toLowerCase() === "path") || "PATH";
    env[pathKey] = [path.dirname(process.execPath), env[pathKey]].filter(Boolean).join(path.delimiter);
    Object.assign(env, {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(directory, ".git", "fixture-global-config"),
        NODE_PATH: path.join(root, "node_modules")
    });

    const run = (command, args, extraEnv = {}, cwd = directory) => {
        const result = spawnSync(command, args, {
            cwd, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 30000
        });
        if (result.error) throw result.error;
        return result;
    };
    const output = result => result.stdout + result.stderr;
    const success = result => assert.equal(result.status, 0, output(result));
    const git = (...args) => {
        const result = run("git", args);
        success(result);
        return result.stdout;
    };
    const write = (file, contents) => {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, contents);
    };
    const copy = file => write(file, fs.readFileSync(path.join(root, file)));
    const setSource = marker => write("src/index.js", `module.exports = class FixturePlugin {
    getName() { return ${JSON.stringify(marker)}; }
};\n`);
    const build = () => success(run(process.execPath, ["scripts/build-plugin.js"]));
    const gate = extraEnv => run(process.execPath, [npmCli, "run", "release:check"], extraEnv);
    const readIndex = () => fs.readFileSync(path.join(directory, ".git", "index"));
    const digest = () => createHash("sha256").update(fs.readFileSync(path.join(directory, artifact))).digest("hex");

    git("init", "-q", "--initial-branch=main");
    git("config", "user.name", "Release Fixture");
    git("config", "user.email", "release-fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgSign", "false");
    git("config", "core.autocrlf", "false");
    git("config", "core.hooksPath", path.join(directory, ".git", "fixture-hooks"));
    for (const file of [
        ".gitignore", ".gitattributes", ".github/workflows/ci.yml", "LICENSE",
        "scripts/build-plugin.js", "scripts/release-check.js", "scripts/release-guards.js"
    ]) copy(file);
    for (const file of [
        "README.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "THIRD_PARTY_NOTICES.md", "docs/host-smoke-test.md"
    ]) write(file, "Synthetic release fixture.\n");
    write("docs/provenance-review.md", "Status: Passed\n");
    write("src/metadata.txt", "/**\n * @name DiscordAITranslator\n * @version 0.0.0\n */\n");
    write("scripts/fixture.ps1", "Write-Output 'fixture'\r\n");
    write("tests/core/tracked-fixture.test.js", "module.exports = 'original';\n");
    write("package.json", JSON.stringify({
        name: "release-snapshot-fixture",
        version: "0.0.0",
        license: "MIT",
        scripts: { "release:check": "node scripts/release-check.js", ci: "node scripts/build-plugin.js --check" }
    }));
    write("package-lock.json", JSON.stringify({ packages: { "": { license: "MIT" } } }));
    setSource("committed bundle");
    build();
    git("add", ".");
    git("commit", "-qm", "Initial fixture");
    return { directory, git, write, setSource, build, gate, readIndex, digest, output, success, run };
}

test("R03 the release gate blocks a stale staged bundle even when the working build passes", t => {
    const fixture = createReleaseFixture(t);
    fixture.setSource("obsolete staged bundle");
    fixture.build();
    fixture.git("add", "--", artifact);
    fixture.setSource("current release bundle");
    fixture.git("add", "--", "src/index.js");
    fixture.build();
    assert.match(fixture.git("show", `:${artifact}`), /obsolete staged bundle/);
    fixture.success(fixture.run(process.execPath, ["scripts/build-plugin.js", "--check"]));
    const staged = path.join(fixture.directory, ".git", "staged-build");
    fixture.git("checkout-index", "--all", `--prefix=${staged.replace(/\\/g, "/")}/`);
    const stagedBuild = fixture.run(process.execPath, ["scripts/build-plugin.js", "--check"], {}, staged);
    assert.equal(stagedBuild.status, 1, fixture.output(stagedBuild));
    assert.match(fixture.output(stagedBuild), /Generated plugin is stale/);
    const indexBefore = fixture.readIndex();

    const blocked = fixture.gate();
    assert.equal(blocked.status, 1, fixture.output(blocked));
    assert.match(fixture.output(blocked), /Working tree differs from Git index: DiscordAITranslator\.plugin\.js/);
    assert.doesNotMatch(fixture.output(blocked), /Generated plugin is up to date|Release checks passed/);
    assert.deepEqual(fixture.readIndex(), indexBefore);

    fixture.git("add", "--", artifact);
    const matchedIndex = fixture.readIndex();
    const checked = fixture.gate();
    fixture.success(checked);
    assert.match(checked.stdout, /Release snapshot: Git index/);
    assert.ok(checked.stdout.includes(`SHA-256 (${artifact}): ${fixture.digest()}`));
    assert.deepEqual(fixture.readIndex(), matchedIndex);
});

test("R03 a staged release blocks changed tracked files and extra CI inputs", t => {
    const fixture = createReleaseFixture(t);
    fixture.write("CHANGELOG.md", "Staged release notes.\n");
    fixture.git("add", "--", "CHANGELOG.md");
    fixture.git("update-index", "--assume-unchanged", "tests/core/tracked-fixture.test.js");
    fixture.write("tests/core/tracked-fixture.test.js", "module.exports = 'modified';\n");
    fixture.write("tests/core/untracked-fixture.test.js", "module.exports = 'extra';\n");
    fixture.write("scripts/untracked.tmp-fixture.js", "module.exports = 'ignored but checked';\n");
    fixture.write(".env", "IGNORED_FIXTURE=1\n");

    const blocked = fixture.gate();
    assert.equal(blocked.status, 1, fixture.output(blocked));
    assert.match(fixture.output(blocked), /Working tree differs from Git index: scripts\/untracked\.tmp-fixture\.js, tests\/core\/tracked-fixture\.test\.js, tests\/core\/untracked-fixture\.test\.js/);
    assert.doesNotMatch(fixture.output(blocked), /\.env|Generated plugin is up to date/);
});

test("R03 without staged changes the gate reviews the dirty working tree in place", t => {
    const fixture = createReleaseFixture(t);
    fixture.setSource("new working-tree bundle");
    fixture.build();
    fixture.write("tests/core/untracked-fixture.test.js", "module.exports = 'working-tree test';\n");
    const indexBefore = fixture.readIndex();

    const checked = fixture.gate();
    fixture.success(checked);
    assert.match(checked.stdout, /Local review: working tree \(no staged changes\)/);
    assert.match(checked.stdout, /Generated plugin is up to date/);
    assert.ok(checked.stdout.includes(`SHA-256 (${artifact}): ${fixture.digest()}`));
    assert.deepEqual(fixture.readIndex(), indexBefore);
    assert.equal(fixture.git("diff", "--cached", "--name-only"), "");
});

test("R03 branch and annotated tag runs bind the checkout and artifact digest to the event commit", t => {
    const fixture = createReleaseFixture(t);
    const tagRef = "refs/tags/release/audit";
    const tagCommit = fixture.git("rev-parse", "HEAD").trim();
    fixture.git("tag", "-a", "release/audit", "-m", "Synthetic release tag");
    const tagObject = fixture.git("rev-parse", tagRef).trim();
    fixture.setSource("later branch bundle");
    fixture.build();
    fixture.git("add", "--", "src/index.js", artifact);
    fixture.git("commit", "-qm", "Later branch commit");
    const branchCommit = fixture.git("rev-parse", "HEAD").trim();
    const summary = path.join(fixture.directory, ".git", "release-summary.md");
    const github = (ref, sha) => ({
        GITHUB_ACTIONS: "true", GITHUB_REF: ref, GITHUB_SHA: sha, GITHUB_STEP_SUMMARY: summary
    });

    const branch = fixture.gate(github("refs/heads/main", branchCommit));
    fixture.success(branch);
    assert.ok(branch.stdout.includes(`Release snapshot: Git commit ${branchCommit}`));
    const branchDigest = fixture.digest();
    assert.ok(fs.readFileSync(summary, "utf8").includes(branchDigest));

    const wrongCommit = fixture.gate(github(tagRef, tagObject));
    assert.equal(wrongCommit.status, 1, fixture.output(wrongCommit));
    assert.ok(fixture.output(wrongCommit).includes(`Checked-out commit ${branchCommit} does not match the event commit ${tagCommit}`));

    fixture.git("checkout", "-q", "--detach", tagRef);
    const tag = fixture.gate(github(tagRef, tagObject));
    fixture.success(tag);
    assert.ok(tag.stdout.includes(`Release snapshot: Git commit ${tagCommit}`));
    const tagDigest = fixture.digest();
    assert.notEqual(tagDigest, branchDigest);
    assert.ok(tag.stdout.includes(`SHA-256 (${artifact}): ${tagDigest}`));
    assert.ok(fs.readFileSync(summary, "utf8").includes(`- Commit: \`${tagCommit}\`\n- SHA-256 (\`${artifact}\`): \`${tagDigest}\``));

    fixture.write("CHANGELOG.md", "Index-only release change.\n");
    fixture.git("add", "--", "CHANGELOG.md");
    const stagedInCi = fixture.gate(github(tagRef, tagObject));
    assert.equal(stagedInCi.status, 1, fixture.output(stagedInCi));
    assert.match(fixture.output(stagedInCi), /Git index differs from Git commit .*: CHANGELOG\.md/);
});

test("R03 the workflow checks out the event SHA and runs for tag-only pushes", () => {
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    assert.match(workflow, /^  push:\r?\n    branches: \["main", "master"\]\r?\n    tags: \["\*\*"\]/m);
    assert.match(workflow, /^\s+ref: \$\{\{ github\.sha \}\}\s*$/m);
    assert.match(workflow, /^\s+run: npm run release:check\s*$/m);
});
