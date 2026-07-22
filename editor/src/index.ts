/**
 * svdsa-edit Worker — the in-browser editor (Phase 2).
 *
 * Separate from production `svdsa`, behind Cloudflare Access. Edit content →
 * save commits to a draft branch (authored as the editor) → the branch's
 * Workers Build is the preview. Publish (merge/MR) comes next.
 * See plans/svdsa-wysiwyg-phase0.md.
 */

import { createGitHub, type Author } from "./git/github";
import {
  branchName,
  parseMarkdown,
  serializeMarkdown,
} from "./content/serialize";

export interface Env {
  GIT_HOST?: "github" | "gitlab";
  EDITOR_DEFAULT_BASE?: string;
  GH_REPO?: string;
  GH_APP_ID?: string;
  GH_INSTALLATION_ID?: string;
  GH_PRIVATE_KEY?: string; // secret (PKCS#8)
  GITLAB_TOKEN?: string; // secret
  GITLAB_PROJECT_ID?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

/** Access injects the authenticated email; see plan for JWT-verification hardening. */
function editor(request: Request): Author {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ?? "editor@svdsa";
  return { name: email, email };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Best-effort Workers Builds preview URL for a branch of the production Worker. */
function previewUrl(request: Request, branch: string): string {
  const host = new URL(request.url).host; // svdsa-edit.<sub>.workers.dev
  const sub = host.split(".")[1] ?? "workers";
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://${alias}-svdsa.${sub}.workers.dev/`;
}

async function health(env: Env) {
  if ((env.GIT_HOST ?? "github") !== "github")
    return { ok: false, error: `GIT_HOST=${env.GIT_HOST} not implemented yet` };
  try {
    const gh = await createGitHub(env);
    const repo = await gh.repoInfo();
    const branches = await gh.listBranches();
    const base = env.EDITOR_DEFAULT_BASE ?? "red";
    return {
      ok: true,
      repo: repo.full_name,
      defaultBranch: repo.default_branch,
      base,
      baseExists: branches.includes(base),
      branches,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function handleApi(
  request: Request,
  env: Env,
  path: string,
): Promise<Response> {
  const url = new URL(request.url);
  const gh = await createGitHub(env);

  if (path === "/api/branches")
    return json({ branches: await gh.listBranches() });

  if (path === "/api/list") {
    const base =
      url.searchParams.get("base") || env.EDITOR_DEFAULT_BASE || "red";
    return json({ base, items: await gh.listContent(base) });
  }

  if (path === "/api/item") {
    const p = url.searchParams.get("path");
    const ref = url.searchParams.get("ref") || env.EDITOR_DEFAULT_BASE || "red";
    if (!p) return json({ error: "path required" }, 400);
    const raw = await gh.readItem(p, ref);
    const { frontmatter, body } = parseMarkdown(raw.text);
    return json({ path: p, ref, frontmatter, body, sha: raw.sha });
  }

  if (path === "/api/save" && request.method === "POST") {
    const {
      base,
      path: p,
      frontmatter,
      body,
    } = (await request.json()) as {
      base: string;
      path: string;
      frontmatter: Record<string, unknown>;
      body: string;
    };
    if (!p || !base) return json({ error: "base and path required" }, 400);
    const who = editor(request);
    const branch = branchName(who.email, base, p);
    await gh.ensureBranch(branch, base);
    const text = serializeMarkdown(frontmatter, body);
    const { commitSha } = await gh.commit({
      branch,
      path: p,
      text,
      message: `edit ${p} (via editor)`,
      author: who,
    });
    return json({ branch, commitSha, previewUrl: previewUrl(request, branch) });
  }

  return json({ error: "not found" }, 404);
}

function page(email: string, defaultBase: string): string {
  const cfg = JSON.stringify({ email, defaultBase });
  const lines = [
    "<!doctype html><html lang=en><head><meta charset=utf-8>",
    "<meta name=viewport content='width=device-width,initial-scale=1'>",
    "<title>SVDSA Editor</title><style>",
    "body{font-family:system-ui,sans-serif;margin:0;color:#191512}",
    "header{background:#c0141a;color:#fff;padding:.6rem 1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}",
    "header b{font-size:1.1rem}select,input,textarea,button{font:inherit}",
    ".wrap{display:grid;grid-template-columns:20rem 1fr;gap:0;height:calc(100vh - 3rem)}",
    "#list{border-right:1px solid #e4ddd2;overflow:auto;padding:.5rem}",
    "#list .f{width:100%;padding:.4rem;margin-bottom:.5rem;box-sizing:border-box}",
    "#list a{display:block;padding:.25rem .4rem;font-size:.85rem;color:#191512;text-decoration:none;border-radius:4px;cursor:pointer;word-break:break-all}",
    "#list a:hover{background:#f3efe9}#list a.sel{background:#f3d9da}",
    "#ed{padding:1rem;overflow:auto;display:none}#ed.on{display:block}",
    "#ed input.title{width:100%;font-size:1.1rem;padding:.4rem;box-sizing:border-box}",
    "#ed textarea{width:100%;height:60vh;margin-top:.5rem;font-family:ui-monospace,monospace;font-size:.85rem;padding:.5rem;box-sizing:border-box}",
    "button.save{background:#c0141a;color:#fff;border:0;padding:.5rem 1rem;border-radius:6px;cursor:pointer;margin-top:.5rem}",
    "#msg{margin-top:.5rem;font-size:.9rem}#path{color:#5f574f;font-size:.8rem}a.ext{color:#c0141a}",
    "</style></head><body>",
    "<header><b>🌹 SVDSA Editor</b>",
    "<span>base <select id=base></select></span>",
    "<span style=margin-left:auto;font-size:.85rem id=who></span></header>",
    "<div class=wrap><div id=list><input class=f id=filter placeholder='filter…'><div id=items></div></div>",
    "<div id=ed><div id=path></div><input class=title id=title placeholder=Title>",
    "<textarea id=body spellcheck=true></textarea><br><button class=save id=save>Save draft</button>",
    "<div id=msg></div></div></div>",
    "<script>",
    "const CFG=" + cfg + ";",
    "document.getElementById('who').textContent=CFG.email;",
    "let cur=null,items=[];",
    "const $=id=>document.getElementById(id);",
    "function base(){return $('base').value}",
    "async function loadBranches(){const r=await fetch('/api/branches');const {branches}=await r.json();",
    "  $('base').innerHTML=branches.map(b=>'<option'+(b===CFG.defaultBase?' selected':'')+'>'+b+'</option>').join('');}",
    "async function loadList(){$('items').innerHTML='loading…';const r=await fetch('/api/list?base='+encodeURIComponent(base()));",
    "  const d=await r.json();items=d.items||[];render();}",
    "function render(){const q=$('filter').value.toLowerCase();",
    "  $('items').innerHTML=items.filter(p=>p.toLowerCase().includes(q)).map(p=>'<a data-p=\"'+p+'\">'+p.replace(/^content\\//,'')+'</a>').join('');}",
    "$('items').addEventListener('click',e=>{const a=e.target.closest('a');if(a)open(a.dataset.p);});",
    "$('filter').addEventListener('input',render);",
    "$('base').addEventListener('change',()=>{loadList();$('ed').classList.remove('on');});",
    "async function open(p){const r=await fetch('/api/item?path='+encodeURIComponent(p)+'&ref='+encodeURIComponent(base()));",
    "  cur=await r.json();$('ed').classList.add('on');$('path').textContent=p;",
    "  $('title').value=(cur.frontmatter&&cur.frontmatter.title)||'';$('body').value=cur.body||'';$('msg').textContent='';",
    "  [...document.querySelectorAll('#items a')].forEach(a=>a.classList.toggle('sel',a.dataset.p===p));}",
    "$('save').addEventListener('click',async()=>{if(!cur)return;$('save').disabled=true;$('msg').textContent='saving…';",
    "  const fm=Object.assign({},cur.frontmatter,{title:$('title').value});",
    "  const r=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},",
    "    body:JSON.stringify({base:base(),path:cur.path,frontmatter:fm,body:$('body').value})});",
    "  const d=await r.json();$('save').disabled=false;",
    "  if(d.error){$('msg').textContent='✗ '+d.error;return;}",
    "  $('msg').innerHTML='✓ saved to <code>'+d.branch+'</code> — preview builds in ~1–2 min: <a class=ext target=_blank href=\"'+d.previewUrl+'\">'+d.previewUrl+'</a>';});",
    "loadBranches().then(loadList);",
    "</script></body></html>",
  ];
  return lines.join("\n");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const who = request.headers.get("Cf-Access-Authenticated-User-Email") ?? "";

    if (url.pathname === "/api/health") return json(await health(env));
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url.pathname);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }
    return new Response(page(who, env.EDITOR_DEFAULT_BASE ?? "red"), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
