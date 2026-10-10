/** Create or update the single "preview link" comment on the PR(s) of the current branch. */
const MARKER = '<!-- ao-preview-link -->';

async function upsertPreviewComment({ github, context, url }) {
  const { owner, repo } = context.repo;
  let numbers;
  if (context.payload.pull_request) {
    numbers = [context.payload.pull_request.number];
  } else {
    const branch = context.ref.replace('refs/heads/', '');
    const { data: prs } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
    });
    numbers = prs.map((p) => p.number);
  }
  const sha = (context.payload.pull_request?.head?.sha ?? context.sha).slice(0, 7);
  const body = [
    MARKER,
    `🎮 **Превью для проверки на телефоне:** ${url}`,
    '',
    `Коммит \`${sha}\`. Превью общее для всех веток: показывает последний push.`,
    'Отладка: добавьте `?debug=1` к ссылке.',
  ].join('\n');
  for (const issue_number of numbers) {
    const { data: comments } = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number,
      per_page: 100,
    });
    const mine = comments.find((c) => c.body && c.body.includes(MARKER));
    if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
    else await github.rest.issues.createComment({ owner, repo, issue_number, body });
  }
}

module.exports = { upsertPreviewComment };
