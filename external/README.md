# External Reference Repos

This directory holds shallow upstream clones used as implementation references for Gitgram and AITM.

Current expected clones:
- `repo2txt`
- `repo-to-text`
- `a2a-js`
- `context7`
- `pal-mcp-server`

Rules:
- do not treat these repos as part of the product source tree
- do not make product changes inside these clones
- pull patterns from them into `gitgram/` or `aitimemachine/` deliberately

Refresh example:

```bash
git -C external/repo2txt fetch --depth 1 origin
git -C external/repo2txt reset --hard origin/main
```
