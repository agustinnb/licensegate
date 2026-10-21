# licensegate

**What your npm dependencies' licences mean for how you ship.**

Most licence checkers give you a list of names. The question that matters depends on how your code reaches people:

| You ship… | `--mode` | AGPL | GPL | LGPL / MPL | Non-commercial |
|---|---|---|---|---|---|
| A hosted web app / API | `saas` | **block** | ok | ok | review |
| An app people download (desktop, mobile, Electron, on-prem) | `distributed` | **block** | **block** | review | review |
| A package other people install | `library` | **block** | **block** | review | review |
| Internal tools only | `internal` | ok | ok | ok | review |

```
npx github:agustinnb/licensegate --mode saas --prod
```

```
licensegate 0.1.0 · mode saas · production only · 412 packages from package-lock.json
  BLOCK  some-db-driver@2.0.0  AGPL-3.0-only
         network copyleft: users who reach the program over a network can ask for its source
  REVIEW fancy-chart@1.4.2  CC-BY-NC-4.0
         source-available or non-commercial terms: check the commercial use clause
  410 ok · 1 to review · 1 blocking
```

- Reads `package-lock.json` (v2/v3) or `node_modules`. Resolves SPDX expressions (`MIT OR GPL-3.0` → you pick MIT), `WITH` exceptions, old `licenses` arrays and loose names (`Apache 2.0`).
- When `package.json` says nothing useful (`SEE LICENSE IN…`, missing), it reads the package's `LICENSE` text.
- Writes a **CycloneDX 1.5 SBOM** (`--sbom`) and a **THIRD_PARTY_NOTICES** file with every licence text (`--notices`).
- Runs offline, with zero dependencies. Your code never leaves your machine.
- Exit code `1` when something blocks your mode (or needs review, with `--fail-on review`). Clear a package you have checked with `--allow name` or `--allow name@version`.

## GitHub Action

```yaml
- run: npm ci
- uses: agustinnb/licensegate@v0
  with:
    mode: saas          # saas | distributed | library | internal
    sbom: sbom.cdx.json
```

## Options

| Flag | |
|---|---|
| `--mode` | `saas` (default), `distributed`, `library`, `internal` |
| `--prod` | skip devDependencies |
| `--fail-on` | `block` (default) or `review` |
| `--allow` | comma list of cleared packages |
| `--sbom F` | write a CycloneDX SBOM |
| `--notices F` | write third-party notices with licence texts |
| `--json F` | write the full result |

## Not legal advice

licensegate is an inventory and a risk flag. Grey areas, such as how a library is linked or bundled, plug-in architectures and dual licences, are marked **REVIEW** on purpose: a person should look at them.

MIT licence.
