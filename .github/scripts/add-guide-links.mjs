// Adds to the API documentation that TypeDoc generated, under each class, function and method that a page of the guide
// uses, the links to those pages ("In the guide:"). The guide publishes which of its pages use which
// part of the API as api-pages.json; this is a step of deploying the API documentation, so that the
// sources do not depend on the guide.
//
// Usage: node add-guide-links.mjs <docs-dir> <api-pages.json> [<guide-url>]
// <guide-url> replaces the address of the guide that api-pages.json names, for a local preview.
// An element of api-pages.json that the documentation does not have, as when the guide already uses
// an API newer than this release, is reported and left out.
import fs from 'node:fs';
import path from 'node:path';

const [docs, data, guideUrl] = process.argv.slice(2);
if (!docs || !data) {
	console.error('Usage: node add-guide-links.mjs <docs-dir> <api-pages.json> [<guide-url>]');
	process.exit(2);
}
const api = JSON.parse(fs.readFileSync(data, 'utf8'));
const guide = (guideUrl ?? api.guide).replace(/\/?$/, '/');
// The guide opens in the language of this documentation.
const language = 'ts';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The block for an element: a link to each page, with its number and title. */
function guideLinks(pages) {
	const items = pages.map((p) => {
		const { number, title } = api.pages[p];
		return `<li><a href="${escape(`${guide}${p}?lang=${language}`)}">${escape(`${number} ${title}`)}</a></li>`;
	});
	return `<p><strong>In the guide:</strong></p>\n<ul class="guide-links">\n${items.join('\n')}\n</ul>\n`;
}

/** The index of the closing tag of the <div> that starts at `start`. */
function endOfDiv(html, start) {
	const tag = /<div\b|<\/div>/g;
	tag.lastIndex = start;
	let depth = 0;
	for (let match = tag.exec(html); match; match = tag.exec(html)) {
		depth += match[0] === '</div>' ? -1 : 1;
		if (depth === 0) return match.index;
	}
	return -1;
}

const COMMENT = '<div class="tsd-comment tsd-typography">';
// A member of a class, or of the object that a namespace of functions is.
const MEMBER = /<h3 class="tsd-anchor-link" id=|<h5 id=/g;

/**
 * Adds the block to the comment of a member, the comment of its first signature if it has several, or
 * to the first comment of a page. Returns the new text, or null if the element is not there.
 */
function addTo(html, anchor, block) {
	const at = anchor === null ? 0 : html.indexOf(`id="${escape(anchor)}"`);
	if (at < 0) return null;
	MEMBER.lastIndex = at + 1;
	const next = anchor === null ? null : MEMBER.exec(html);
	const limit = next?.index ?? html.length;
	const comment = html.indexOf(COMMENT, at);
	if (comment < 0 || comment > limit) {
		const description = html.indexOf('<div class="tsd-description">', at);
		if (description < 0 || description > limit) return null;
		const inside = html.indexOf('>', description) + 1;
		return `${html.slice(0, inside)}${COMMENT}${block}</div>${html.slice(inside)}`;
	}
	const end = endOfDiv(html, comment);
	if (html.slice(comment, end).includes('<ul class="guide-links">')) return html;
	return html.slice(0, end) + block + html.slice(end);
}

const byFile = new Map();
for (const [element, pages] of Object.entries(api.ts ?? {})) {
	const [file, anchor] = element.split('#');
	if (!byFile.has(file)) byFile.set(file, []);
	byFile.get(file).push({ anchor: anchor ?? null, pages });
}

let linked = 0;
const missing = [];
for (const [file, elements] of byFile) {
	const target = path.join(docs, file);
	if (!fs.existsSync(target)) {
		missing.push(...elements.map((e) => `${file}${e.anchor === null ? '' : `#${e.anchor}`}`));
		continue;
	}
	let html = fs.readFileSync(target, 'utf8');
	for (const { anchor, pages } of elements) {
		const next = addTo(html, anchor, guideLinks(pages));
		if (next === null) missing.push(`${file}${anchor === null ? '' : `#${anchor}`}`);
		else if (next !== html) {
			html = next;
			linked++;
		}
	}
	fs.writeFileSync(target, html);
}
console.log(`Linked ${linked} items and methods to the guide at ${guide}.`);
if (missing.length) console.log(`Not in this documentation, left out:\n  ${missing.join('\n  ')}`);
