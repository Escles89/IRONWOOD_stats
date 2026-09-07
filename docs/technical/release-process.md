# Build, development and release

1. Edit feature sources in `src/` and metadata in `src/build/metadata.txt`.
2. Run `npm run build` with Node 22 or newer. The dependency-free assembler reads the explicit module manifest, serializes CSS and wraps the result in the userscript IIFE.
3. Run `npm run check` and inspect the generated diff.
4. Reload the connected game using the local loader and verify relevant behavior.
5. Commit source, tests, documentation and `ironwood-stats.user.js` together.

Build output is deterministic: there are no build timestamps, absolute paths or external runtime imports. Increment the metadata version for a publication release and keep package.json aligned. The build injects the runtime version from metadata; it is displayed below the Status title. The generated artifact also carries the noncommercial license URL and the required project attribution notice.

## Local development loader

Replace `/ABSOLUTE/PATH/TO/IRONWOOD_stats` in the loader’s `@require` line with your checkout path, keeping the personalized copy in Tampermonkey. Install `ironwood-stats-loader.user.js` in Tampermonkey and disable the full installed copy of `ironwood-stats.user.js`. The loader uses `@require` to execute the repository copy directly, so subsequent edits only require refreshing the Ironwood tab.

In Chrome, open **Extensions → Tampermonkey → Details** and enable **Allow access to file URLs**. Tampermonkey may also expose a local-file access option in its own settings; enable it if present. Update the installed loader’s path if you move the repository.

## Publication

The in-game update checker reads the Greasy Fork installation source from Tampermonkey's `GM_info` (`scriptUpdateURL`, or the script's update/download/file URL). It compares the installed build version with the published `.meta.js` version on `update.greasyfork.org`. The arrow links to that script's Greasy Fork page; Tampermonkey manages actual updates. Do not add a GitHub `@updateURL` or `@downloadURL` override. Publish a higher version on Greasy Fork to notify installed users. Local loaders and pasted installations fall back to the project’s public Greasy Fork listing (script 594029). The metadata name validates the result while allowing the legacy namespace in earlier releases. Checks use anonymous CORS fetches with an eight-second timeout; results are stored separately from gameplay caches and checked at most once every six hours (15 minutes after failures).

## Greasy Fork

Publish `ironwood-stats.user.js` as the complete userscript. Do not publish
`ironwood-stats-loader.user.js`; that file is only a local development loader.

1. Sign in to Greasy Fork.
2. Open your profile and choose **Publish a script you've written**.
3. Paste the complete contents of `ironwood-stats.user.js`, or import its raw
   GitLab URL after the repository is public.
4. Use the project overview from `README.md` as the listing description.
5. Clearly retain the description of optional automations and the global
   automation-disable preference.

For subsequent releases, increment `@version` before committing. Greasy Fork
can then synchronize the script from the raw GitLab branch URL. Configure the
sync against `ironwood-stats.user.js` on the default branch, not a commit URL
and not the local loader.

## GitLab

The repository includes `.gitlab-ci.yml`. Every GitLab pipeline verifies that
the userscript parses, contains the publication metadata Greasy Fork expects,
and remains below Greasy Fork's 2 MiB limit.

After creating an empty GitLab project, add its Git URL as `origin` and push
the default branch. Use either SSH authentication or a GitLab personal access
token managed by the local credential helper; never commit credentials.



Always publish the generated root userscript. Do not publish source fragments or the local loader. CI rejects a stale generated file.
