# How to edit siliconvalleydsa.org

Every change — from fixing a typo to redesigning the theme — flows through the
same git repository. What differs is the on-ramp. Find yourself on the ladder
below; each rung is optional and you can climb (or not) at your own pace.

```mermaid
flowchart TD
    Start([I want to change something on the site]) --> What{What kind of change?}

    What -->|"Words, events, posts,<br/>pages (content)"| HowEdit{How do you<br/>like to work?}
    What -->|"Colors, fonts, layout,<br/>new page types (design/code)"| Code[Code change]
    What -->|"Nav menu, socials,<br/>photo strip (site config)"| Config[Config JSON<br/>git only, for now]

    HowEdit -->|"Just let me type"| W1[Open <b>edit.svdsa</b> in a browser<br/>sign in with any account<br/>Cloudflare Access checks the editor list]
    HowEdit -->|"I know Markdown"| W1
    HowEdit -->|"I live in git"| G1[Clone the repo<br/>branch off <code>red</code>]

    W1 --> W2["Pick a file → edit in<br/><b>Rich text</b> (WYSIWYG) or<br/><b>Markdown</b> (VS Code engine)"]
    W2 --> W3[Save draft<br/>auto-fixes style rules<br/>commits to <code>draft/you/red</code>]
    W3 --> W4[Preview link<br/>your own live copy of the site<br/>rebuilds ~1–2 min per save]
    W4 -->|more edits,<br/>any number of files| W2
    W4 --> W5[Publish → opens a PR]

    G1 --> G2["Edit content/*.md in your editor<br/>(bun run dev for live preview,<br/>bun run lint:content for style checks)"]
    G2 --> G3[Push your branch<br/>every branch gets a preview at<br/><code>&lt;branch&gt;-svdsa.…workers.dev</code>]
    G3 --> G4[Open a PR to <code>red</code>]

    Code --> C1["app/ (React), styles, editor/<br/>theme experiments live on<br/><code>theme/*</code> branches"]
    C1 --> G3

    W5 --> R[PR reviewed on GitHub<br/>by someone with merge rights]
    G4 --> R
    R -->|merge| Live[(<code>red</code> rebuilds →<br/>live site updated)]
    R -->|changes requested| Back[Keep editing —<br/>same draft/branch updates<br/>the same PR]
    Back --> W2
    Back --> G2
```

## The rungs, in words

| You are…                 | You use…                                                                                                                                                                     | Your safety net                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **WYSIWYG-only**         | [the editor](https://svdsa-edit.isozilla.workers.dev) in Rich text mode. No git, no Markdown, no accounts to create — sign in with whatever you have (Google, email OTP, …). | Nothing you do touches the live site. Saves go to your personal draft; Publish just _asks_ (opens a PR). Discard throws the draft away. |
| **Markdown-comfortable** | the same editor, Markdown mode (the VS Code engine — find/replace, multi-cursor).                                                                                            | Same draft/PR flow. Modes toggle losslessly, use both.                                                                                  |
| **Git-comfortable**      | a clone; edit `content/**/*.md` directly. One file per page/post/event; add a file to add content.                                                                           | Branch + PR. Every pushed branch gets its own full preview site.                                                                        |
| **Developer**            | `app/` (React Router), `editor/`, `scripts/`. Theme experiments on `theme/*` branches.                                                                                       | Same PRs, plus typecheck/tests/lint in the repo.                                                                                        |

Style rules (the San José é, inclusive language, …) live in
`content/config/style-rules.json` and apply to **everyone the same way**: the
editor auto-fixes what it can on every save and warns about the rest;
git users run `bun run lint:content` (`--fix` to apply).

Recurring events are ONE file with a `repeats:` rule (see
`scripts/expand-recurring.ts`); don't create per-date copies.

## Merge rights

`red` is the live site. Publishing only opens a PR — a reviewer with write
access merges it. That list is currently the tech working group; the
Cloudflare Access **editor list** (who can use the editor at all) is separate
and easier to join.
