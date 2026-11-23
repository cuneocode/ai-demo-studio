# JSON presentation packages

Studio loads optional presentation packages inside its existing shell. Bundled
TypeScript packages remain the authoring source for installed demos. JSON supplies
catalog entries, presentation copy, guides, and approved workspace references.
Native React components and backend registrations retain their existing contracts.

## Edit and test a pack

1. For an installed demo, keep its default authoring files in
   `demos/<demo-id>/`. Export a starter pack when you want a presentation variant
   with the existing narrative, presenter notes, or guides.
2. Edit the module's `modules/<slug>/content.json` and its entry in
   `approved.json`. Keep the module slug and its use-case IDs stable for shared
   links. Use `x-studio.nativeDemoId` for an installed workspace or `url` for an
   external application.
3. Run `STUDIO_CONTENT_ROOT=.studio/content-export npm run studio:content:validate`
   with the path to your pack. Launch Studio with the same value and visit
   `/?content=<slug>`. Check the
   intended library, copy, guide, and workspace in Codex's built-in browser.
4. Refresh the content launch URL after editing the JSON. Open `/` without a
   content query to check the bundled experience. If an in-memory override masks
   the edit, clear it with `{"load":"default"}` as described below.

For a native binding, also open the regular demo route and confirm both entry
points launch the same installed workspace. Follow the demo's live verification
steps when execution or integrations change.

## Export the installed catalog

Use Node 24. Export into a new directory so existing packages are preserved:

```sh
npm run studio:content:export -- --out .studio/content-export --base-url https://studio.example --repo example/ai-demo-studio
STUDIO_CONTENT_ROOT=.studio/content-export npm run studio:content:validate
STUDIO_CONTENT_ROOT=.studio/content-export npm run dev:studio
```

The output contains `approved.json`, `modules/<slug>/content.json`, `content.schema.json`, and an
`export-report.json` describing legacy rendering and preserved Studio extensions.
It includes each installed library and an aggregate `industry-apps` module.

For Neil's existing Phoenix-based renderer, supply one of his current content
files as a data template:

```sh
npm run studio:content:export -- --out .studio/sage-export --base-url https://studio.example --legacy-template /path/to/neil-content.json
```

This preserves the extra `ask`, `layers`, `scale`, `edge`, `tco`, and related data
that his current `app.js` expects. Studio replaces the catalog and presentation
identity with the exported values. Review inherited template content before
publishing. The report records whether a template was supplied. Copy the module
directories to Sage and merge the approved rows into its manifest. Exported rows
include `base: "phoenix"` and `entry: "app/site/index.html"` to use the shell
already installed in his host. The core repository contains no Phoenix frontend.
`--base-url` is the deployed Studio origin, used to generate portable workspace
links. `--repo` is optional. Each export refuses to overwrite existing files.

The normal Studio is the default. There is no content-package picker in the UI.
Operators install approved JSON files through `STUDIO_CONTENT_ROOT` and launch
`/?content=<slug>` or `/select/<slug>` when an overlay is needed. Exporting files
does not install or select them. `/` and `/studio` use the bundled catalog.
Legacy page links using `?module=<slug>` redirect to the canonical `?content=<slug>`
URL. An explicit content selection follows navigation, refresh, and browser
history. Open a Studio URL without `content` to return to the installed defaults.

`STUDIO_CONTENT_ROOT` names a local directory containing `approved.json` and a
`modules/` directory. The default is `config/content`, whose approved list is
empty. The standard checkout therefore retains the bundled experience. Set this
variable in the launching environment. Files and symlinks must resolve inside
the configured root and their module directory. Documents have a 256 KiB limit.
The Node host serves content in development and production. Worker-only hosting
has no local package filesystem and uses the bundled catalog.

## Import a Neil-compatible module

The manifest uses the same array shape as `content-load-default`:

```json
[
  {
    "id": "retail-review",
    "name": "Retail review",
    "dir": "retail-review",
    "content": "content.json",
    "base": "phoenix",
    "entry": "app/site/index.html",
    "x-studio": { "appId": "retail" }
  }
]
```

Place the document at `modules/retail-review/content.json`:

```json
{
  "title": "Retail review",
  "headline": "Store operations",
  "usecases": [
    {
      "id": "store-copilot",
      "title": "Store operations copilot",
      "tagline": "Review synthetic store findings and choose a response.",
      "who": "Store manager",
      "data": "Synthetic store records",
      "agent": "Operations assistant",
      "gpu": "Workload assumptions maintained by the application owner",
      "url": "https://retail.example/copilot",
      "repo": "example/retail-studio",
      "story": [["Store decisions", "The manager reviews evidence and approves the next action.", ""]]
    }
  ],
  "build": {
    "views": { "customer": { "label": "Customer" } },
    "guide": [{ "route": "uc/store-copilot/demo", "text": "Review the manager's workspace." }]
  }
}
```

The `base` and `entry` fields are accepted for compatibility. Studio uses its own
installed frontend. Unknown presentation fields are retained for export or other
consumers. JSON is rendered as text, with supported HTTP(S) or same-Studio URLs.
No HTML, JavaScript, stylesheet, or backend commands are executed from a package.

Existing unversioned files load directly. Entries without a library mapping use
Horizontal. For Neil's `industry-apps` slug, entries whose IDs match an installed
library are assigned to that library. Their `workspaces` remain named links on
the summary entry. Use explicit mappings when importing another module shape.
Installed library IDs remain the authority for navigation and enablement.

## Native bindings and rich content

A use case can include an `x-studio` object:

```json
{
  "id": "sar-review",
  "title": "SAR investigation",
  "url": "https://studio.example/apps/fsi/demos/sar-support",
  "x-studio": {
    "nativeDemoId": "sar-support",
    "appId": "fsi",
    "category": "Risk & compliance"
  }
}
```

The native demo ID selects an installed workspace. Its actual library ownership,
runtime, architecture, controls, model routing, run identity, and storage remain
those of the installed demo. A native binding takes precedence over `url`.
A manifest can supply equivalent operator-owned mappings through
`x-studio.bindings`, keyed by JSON use-case ID.

Exported documents carry top-level `x-studio.schemaVersion: 1`. Their use-case
extensions preserve the full narrative and references, presenter notes,
workspace framing, architecture identity, outcome, category, and authored tours.
Studio renders supported narrative and presenter content including workspace framing text, while retaining native
workspace execution and action tours from installed code. Legacy consumers use the
standard `story` and `build.guide` fields. The export report identifies this
presentation difference. New action handlers and draw.io diagrams require their
normal code registrations.

Imported entries use stable IDs `json-<module-length>-<module>-<use-case>` within their owning
library. The length prefix prevents collisions between hyphenated module and
use-case names. Native IDs and saved-run keys stay unchanged. Imported entries augment
the installed catalog; native bindings overlay presentation copy. They grant no
additional access to native runtimes or disabled libraries.

## Audience copy and guides

`build.views.customer` and `build.views.specialist` provide audience labels and
notes. Missing Specialist fields inherit Customer content, retaining the
Specialist label. Append `&audience=specialist` to a content launch URL to select
that audience for the session; `&audience=customer` selects Customer. Per-use-case `specialist` fields supply alternate title,
tagline, story, users, data, agent, workload, and workspace URL. Presenter notes
remain restricted to the existing presenter UI.

`build.guide` accepts `{route, text, specialist?}` steps. Supported destinations
are `overview`, `library`, and `uc/<id>/demo`, `uc/<id>/arch`, `uc/<id>/size`.
They map to existing Studio navigation and tab URLs. Unsupported steps report an
unavailable destination. Append `&review=1` to a content launch URL to display
the first review step. Step navigation appears only during an explicitly started
review; normal launch links keep it hidden.
Guided review navigates presentation content; installed
action tours retain their normal execution and approval behavior.

## Workspace behavior

External applications open through the existing workspace panel. **Open in
Studio** explicitly loads an iframe. A direct new-tab link remains available.
HTTP destinations on HTTPS pages open in a new tab. Applications that prohibit
framing can also use the new-tab link. Closing an embedded view unloads it.
Same-origin Studio destinations navigate internally to avoid recursive shells.

External run measurements, inspection decisions, and trace delivery remain
unknown until an application supplies a supported integration. The shared stats
panel states this. Capacity planning initializes from the entry's description;
its production demand and observations remain separate. External entries without
registered architecture show **Architecture unavailable**. Native entries retain
their installed draw.io explorer and run-informed Capacity planning.

Splunk and AI Defense credentials remain installation settings. Descriptive
package labels such as `LIVE` or `gpu` do not establish execution or readiness.

## Content API and session overrides

`GET /api/studio/content/modules` lists approved modules.
`GET /api/studio/content?module=<slug>` returns a validated snapshot, its revision,
and resolved entries. `GET /api/motion/content?module=<slug>` returns the legacy
normalized document directly. A successful content request selects that module
for subsequent requests in the same session, allowing the legacy endpoint to
omit the query parameter.

POST either content endpoint with a JSON object, or `{ "content": { ... } }`.
Objects merge recursively, lists replace, and null removes a field. For example:

```json
{ "headline": "Customer review", "subtitle": null }
```

`{ "load": "default" }` clears the selected module's override. The default file
is never rewritten. Cookies isolate browser sessions; overrides are kept in
memory for up to eight idle hours and clear on server restart. Limits bound the
number of sessions. Cross-origin browser writes are rejected. Session overrides
cannot change authored `x-studio` extensions or native bindings. Install a revised
package for those changes. These local operator APIs inherit the deployment's
access controls; they do not add a hosted authentication system.

Refresh a content launch URL after editing package files or adding manifest entries.
Clear session overrides with the reset API described above.
The server reads current files on each content request, without a frontend build.
Malformed packages return an explicit error and never partially apply an overlay.

## Compatibility evidence

The adapter follows the documented `content-load-default` shapes inspected in
Neil's fork, including module selection, Customer/Specialist fallbacks, guides,
workspace URLs, extra links, and per-session merges and legacy trailing-slash API paths. Synthetic compatibility
fixtures live in `fixtures/content/`. Node tests cover imports, exports, scope,
paths, session isolation, reset, and native bindings. Browser validation uses the
native Codex browser against a running Studio. Interoperability with a separately
running Sage consumer must be confirmed in that deployment.
