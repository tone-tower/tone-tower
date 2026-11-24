# Publishing Tone Tower

Tone Tower is a static browser game. Node.js is needed only for local tools and
GitHub's build, not by visitors. Code is MIT; recordings, dictionary content and
fonts retain their separate licences in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## One-time GitHub setup

1. The production site is the `tonetower` organization's GitHub Pages site.
   Its public repository is named `tonetower.github.io` to serve it at the domain root.
2. In this project's terminal, run the release checks below. Stop any audio
   importer/downloader first so the inventory and word registry form one release.
3. Git is initialized on `main`. Review the files before the first commit:

   ```sh
   git status --short
   git add .
   git diff --cached --stat
   git commit -m "Prepare Tone Tower for GitHub Pages"
   git remote add origin https://github.com/tonetower/tonetower.github.io.git
   git push -u origin main
   ```

   For an existing checkout, use `git remote set-url origin https://github.com/tonetower/tonetower.github.io.git`.
   Git may ask you to sign in.
   If it asks for a commit identity, configure `git config user.name` and
   `git config user.email` locally; GitHub's private noreply email is suitable.
   The existing copyright notice is preserved; use your chosen public credit if
   you later update it, retaining any notices for other contributors.

4. In the repository, open **Settings → Pages → Build and deployment** and set
   **Source** to **GitHub Actions**. If the first run failed before this setting
   was enabled, rerun it from **Actions → Check and deploy Pages**. The workflow
   also offers **Run workflow** on `main`.
5. Open the deployment link from the successful workflow or Pages settings:
   `https://tonetower.github.io/`. Ensure **Enforce HTTPS** is
   enabled when available, then run the short live-site checklist below.

GitHub Free supports Pages for public repositories. This workflow uses GitHub's
automatic GITHUB_TOKEN; do not create a personal access token or add secrets.
If Actions is disabled on the repository, enable it under Settings → Actions.
Configure a branch ruleset for `main`: require pull requests and the **Test and build** status check, block force pushes and deletion, and require zero additional approvals for this solo project. This setting lives in GitHub and cannot be enforced by committed workflow YAML. The implementation environment has no branch-protection write capability, so this administrative step must be applied in repository Settings → Rules → Rulesets.

## Local release checks

Use Node.js 22.12 or later. Run `npm ci` to install the locked development tools. Install Chromium with `npx playwright install chromium`. The game has no runtime npm dependencies.
The full test suite also needs FFmpeg and FFprobe on PATH for importer checks;
the GitHub workflow installs these tools when needed.

```sh
npm run format:check
npm run typecheck
npm run audio:sync
npm run test:all
npm run mandarin:status -- --release
npm run build
npm run check:dist
git diff -- data/audio
npm run preview -- --port 4174
```

Review and commit registry changes with their matching inventory and MP3s.
The preview serves only `dist/` at http://127.0.0.1:4174/. To preview a nested deployment,
use `npm run preview -- --base /preview/nested/ --port 4174` and open
http://127.0.0.1:4174/preview/nested/.
`npm start` runs Vite and generates language pages for development. Do not publish the source root:
`catalogs/` is generated and absent after a fresh clone.

CI checks types and formatting, runs Vitest Node/browser and Node tooling tests, enforces Mandarin readiness, and builds without updating versioned metadata, checks that source data stays unchanged,
then checks every built file under both `/` and a different nested repository
path. Pull requests can run checks but cannot deploy. Only successful `main`
builds deploy. Vite processes application assets; publication copies only selected recordings and required notices. Distribution checks verify an output manifest and content hashes, and Playwright verifies generated pages under root and nested paths. Official actions are pinned to release commits; Dependabot opens
monthly update PRs for them. The npm download cache speeds up installation of development tools.

An optional deeper audio check is `npm run audio:verify` after building. It
requires FFmpeg and FFprobe and decodes every published recording. It does not
replace listening review.

## Browser release checklist

Check the built preview before the first launch or a gameplay change, then repeat
a short check on the live URL. Target current desktop Chrome/Edge and Firefox,
Android Chrome and iPhone Safari. Desktop device emulation helps check layout,
but actual phones are needed to confirm mobile audio and keyboard behaviour.

- The root language chooser and each language’s home, `guide/`, `about/`, and `practice/` load directly; back/forward and Home stay within that language.
- Both adventures and practice start; recordings play after a user gesture,
  replay works, and unavailable audio offers recovery without awarding progress.
- Tone Tower accepts keyboard and touch answers. Skyrail remains usable with
  the phone keyboard open; the prompt, input and replay remain visible.
- Pause, tab switching, review, retry and return to the map behave correctly.
- Records survive reload, practice stays separate, and blocked local storage
  does not stop play. Closing or refreshing ends the current run.
- Keyboard focus is visible; dialogs accept and restore focus; reduced motion
  remains usable; small screens have no obstructed controls or horizontal scroll.
- Voices & credits, font licences, code licence and third-party notices open.
- Browser console and Network panel show no unexpected errors or missing files.

## Updates and rollback

Commit source changes and push to `main`, or merge a passing PR. GitHub builds and
deploys automatically. Watch the Actions result; a failed check leaves the previous
site deployed. After success, check the live URL with a fresh reload.

To roll back, revert the problematic commit with `git revert COMMIT-SHA`, then push
the revert. This rebuilds and deploys the previous behaviour without rewriting
history. Do not commit or manually edit `dist/`.

## Renaming later

You can rename the GitHub repository in its Settings and update the local remote
URL with `git remote set-url origin NEW-REPOSITORY-URL`. Redeploy and use the new
Pages address. Runtime paths resolve relative to the deployment root. Update the
site and repository URLs in `src/site.ts`, the chooser metadata and footer link in
`index.html`, and the public links in the README, organization profile and repository About panel.
Update the Wikimedia Commons importer contact URL and rebuild. Keep the versioned
save-data keys stable.

GitHub Pages sites on one account share an origin, so keep save keys unique to
this app. A new domain or account has separate browser storage; records do not
automatically move between origins. The app has no accounts or analytics;
GitHub's hosting privacy practices still apply.

References: [Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site),
[custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[Pages availability and privacy](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Public identity, sharing and feedback

The build emits real directory pages under `/cantonese/`, `/mandarin/` and `/vietnamese/`, each with
its own title, description, canonical URL and Open Graph / social card metadata.
GitHub Pages can serve these directly; no rewrite or 404 redirect is needed.
The guide and About content are included in the initial HTML for crawlers.
The home address stays free of `#home`; URL fragments are only for in-page anchors.
The build publishes a sitemap at `https://tonetower.github.io/sitemap.xml` using the production
URLs from `src/site.ts`.

Public identity and page descriptions live in `src/site.ts`. The root chooser is `index.html`; the generated language pages use `src/shell.html`. The branded artwork lives in
`assets/brand/`; the 1200 × 630 PNG is the social preview, and the SVG is its editable
source. The sprout favicon is supplied as SVG and ICO, plus an Apple touch icon.
Social services may cache old previews after deployment.

### GitHub organization and repository

1. Upload the [sprout icon](../assets/brand/apple-touch-icon.png) and set the organization website to `https://tonetower.github.io/`. [Organization profile settings](https://github.com/organizations/tonetower/settings/profile)
2. Update `profile/README.md` in the public `tonetower/.github` repository using the text below. GitHub displays that file on the organization overview. Select `tonetower/tonetower.github.io` in the public pins. [Organization profile README](https://github.com/tonetower/.github/blob/main/profile/README.md) · [GitHub organization profile guide](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile)
3. In the main repository's **About** panel, set the website to `https://tonetower.github.io/` and the description to “Free browser games for practising tones and spelling.” [Main repository](https://github.com/tonetower/tonetower.github.io)
4. In the repository's **Settings → General → Social preview**, upload the [share card](../assets/brand/share-card.png). [GitHub social preview guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)

```markdown
# Tone Tower

Listening games for Cantonese, Mandarin and Vietnamese.

**[Play in your browser](https://tonetower.github.io/)**

[Cantonese](https://tonetower.github.io/cantonese/) · [Mandarin](https://tonetower.github.io/mandarin/) · [Vietnamese](https://tonetower.github.io/vietnamese/)

Listen and choose a tone in Tone Tower, or practise Jyutping and Pinyin spelling in Skyrail.
```

Keep **Issues** and **Discussions** enabled in **Settings → General → Features**.
Bug and recording report forms live in `.github/ISSUE_TEMPLATE/`. The issue chooser
directs ideas, feedback and questions to Discussions. The site and README use the
`ideas-feedback` slug to open a new discussion in **Ideas & Feedback**. If you
rename the category, check its slug and update those links. Issues and discussions
are public, and posting requires a GitHub account.

After deployment, share the home and guide URLs in a messaging app and check the
preview image and text. Also check favicon, touch icon, footer links, issue forms
and the Ideas & Feedback discussion link.

Mandarin beta readiness depends on playable coverage; manual listening approval is optional. See [Mandarin website and curation](MANDARIN-WEBSITE.md). The beta uses dictionary matches and common tone-change estimates, with separate corrections for reported problems. Builds never modify `data/content/` or the downloader archive. No old root-level route aliases or redirects are generated.

## Tooling boundaries

TypeScript checks application contracts; it does not replace runtime validation of catalogs or browser storage. Vite owns module and asset processing, while content tooling owns dictionary evidence, recording eligibility and attribution. Language HTML is staged in the OS temporary directory and removed after builds. The preview server serves only the built directory and has no source-route rendering. `dist/` includes a generated `.publication.json` inventory used by `check:dist`; do not edit it.

Use `npm run test:browser` for the full browser release check; it builds first. CI runs `npx playwright test` after its explicit build to avoid repeating that build. Curation and builds share a Mandarin content lock, independent of the downloader lock; conflicting operations fail clearly and can be retried after the current command finishes.
