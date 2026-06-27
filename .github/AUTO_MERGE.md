# Automatický auto-merge

Každý otevřený PR (mimo draft) se díky workflow `.github/workflows/auto-merge.yml`
sám zařadí do GitHub auto-merge (squash). GitHub PR smerguje, jakmile projde
povinný status check **Vercel**.

- Branch protection na `main`: povinný check `Vercel`, žádný povinný review.
- Action běží pod default `GITHUB_TOKEN`, žádný secret není potřeba.
- `delete_branch_on_merge` je zapnuté → větev se po mergi smaže sama.

Není tedy potřeba spouštět `gh pr merge --auto` ručně - stačí PR otevřít.
