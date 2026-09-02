# Publishing

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

