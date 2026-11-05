const container = document.getElementById('archives');
try {
  const response = await fetch('./catalog.json');
  if (!response.ok) throw Error('Catalogue unavailable');
  const { repository, revision, artifacts } = await response.json();
  const fragment = document.createDocumentFragment();
  for (const entry of artifacts) {
    const card = document.createElement('article');
    card.className = 'archive-card';
    const kind = document.createElement('div');
    kind.className = 'archive-kind';
    kind.textContent = entry.category;
    const title = document.createElement('h2');
    title.textContent = entry.title;
    const description = document.createElement('p');
    description.textContent = entry.description;
    const download = document.createElement('a');
    download.href = `https://raw.githubusercontent.com/${repository}/${revision}/${entry.repositoryPath}`;
    download.textContent = `Скачать ZIP · ${(entry.bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} МиБ`;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'SHA-256 и источники';
    const digest = document.createElement('code');
    digest.textContent = entry.sha256;
    details.append(summary, digest);
    for (const source of entry.sources) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = source.url;
      link.textContent = source.label;
      paragraph.append(link);
      details.append(paragraph);
    }
    card.append(kind, title, description, download, details);
    fragment.append(card);
  }
  container.replaceChildren(fragment);
} catch {
  container.textContent =
    'Не удалось загрузить список. Обновите страницу или откройте папку research в репозитории.';
}
