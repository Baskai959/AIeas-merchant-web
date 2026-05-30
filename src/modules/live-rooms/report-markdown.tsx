import React from 'react';
import SafeImage from '@/components/SafeImage';
import styles from './report-markdown.module.less';

interface ReportMarkdownProps {
  content?: string;
}

const FENCE_RE = /^```([\w-]+)?\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const HORIZONTAL_RULE_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const UNORDERED_LIST_RE = /^\s*[-*+]\s+(.+)$/;
const ORDERED_LIST_RE = /^\s*\d+[.)]\s+(.+)$/;
const MARKDOWN_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const INLINE_TOKEN_RE =
  /(?:!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|(https?:\/\/[^\s<>()]+))/g;
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

function cleanMarkdownUrl(value?: string) {
  return (value || '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/^['"]|['"]$/g, '');
}

function getSafeUrl(value?: string) {
  const url = cleanMarkdownUrl(value);
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) {
    return url;
  }
  return '';
}

function isImageUrl(url?: string) {
  const pathname = cleanMarkdownUrl(url).split('#')[0].split('?')[0];
  return IMAGE_EXTENSION_RE.test(pathname);
}

function splitTableRow(line: string) {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return normalized.split('|').map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number) {
  return (
    index + 1 < lines.length &&
    lines[index].includes('|') &&
    TABLE_SEPARATOR_RE.test(lines[index + 1])
  );
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index];
  const trimmed = line.trim();
  return (
    !trimmed ||
    FENCE_RE.test(trimmed) ||
    HEADING_RE.test(trimmed) ||
    HORIZONTAL_RULE_RE.test(trimmed) ||
    trimmed.startsWith('>') ||
    UNORDERED_LIST_RE.test(line) ||
    ORDERED_LIST_RE.test(line) ||
    isStandaloneImageLine(trimmed) ||
    isTableStart(lines, index)
  );
}

function isStandaloneImageLine(line: string) {
  const imageMatch = line.match(MARKDOWN_IMAGE_RE);
  if (imageMatch) {
    return !!getSafeUrl(imageMatch[2]);
  }
  return /^https?:\/\//i.test(line) && isImageUrl(line);
}

function renderImage(
  src: string,
  alt: string,
  key: string,
  options: { inline?: boolean } = {}
) {
  const safeSrc = getSafeUrl(src);
  if (!safeSrc) {
    return alt || src;
  }

  if (options.inline) {
    return (
      <span className={styles.inlineImageWrap} key={key}>
        <SafeImage className={styles.image} src={safeSrc} alt={alt} />
      </span>
    );
  }

  return (
    <figure className={styles.imageFigure} key={key}>
      <SafeImage className={styles.image} src={safeSrc} alt={alt} />
      {alt ? <figcaption className={styles.imageCaption}>{alt}</figcaption> : null}
    </figure>
  );
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  text.replace(INLINE_TOKEN_RE, (match, imageAlt, imageSrc, linkText, linkHref, code, strongA, strongB, emA, emB, plainUrl, index) => {
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const key = `${keyPrefix}-${index}`;
    if (imageSrc !== undefined) {
      nodes.push(
        imageSrc
          ? renderImage(imageSrc, imageAlt || '', key, { inline: true })
          : match
      );
    } else if (linkText) {
      const safeHref = getSafeUrl(linkHref);
      nodes.push(
        safeHref ? (
          <a
            className={styles.link}
            href={safeHref}
            target="_blank"
            rel="noreferrer"
            key={key}
          >
            {linkText}
          </a>
        ) : (
          linkText
        )
      );
    } else if (code) {
      nodes.push(
        <code className={styles.inlineCode} key={key}>
          {code}
        </code>
      );
    } else if (strongA || strongB) {
      nodes.push(<strong key={key}>{strongA || strongB}</strong>);
    } else if (emA || emB) {
      nodes.push(<em key={key}>{emA || emB}</em>);
    } else if (plainUrl) {
      const safeHref = getSafeUrl(plainUrl);
      nodes.push(
        safeHref && isImageUrl(safeHref) ? (
          renderImage(safeHref, '', key, { inline: true })
        ) : (
          <a
            className={styles.link}
            href={safeHref || plainUrl}
            target="_blank"
            rel="noreferrer"
            key={key}
          >
            {plainUrl}
          </a>
        )
      );
    }

    lastIndex = index + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function ReportMarkdown(props: ReportMarkdownProps) {
  const content = props.content?.trim();
  if (!content) {
    return <span className={styles.empty}>报告内容为空</span>;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const key = `block-${index}`;

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      elements.push(
        <pre className={styles.codeBlock} key={key}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      elements.push(
        React.createElement(
          `h${level}`,
          { key },
          renderInline(headingMatch[2], `${key}-heading`)
        )
      );
      index += 1;
      continue;
    }

    if (HORIZONTAL_RULE_RE.test(trimmed)) {
      elements.push(<hr className={styles.divider} key={key} />);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      elements.push(
        <div className={styles.tableWrap} key={key}>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`${key}-h-${headerIndex}`}>
                    {renderInline(header, `${key}-h-${headerIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>
                  {headers.map((_, cellIndex) => (
                    <td key={`${key}-r-${rowIndex}-${cellIndex}`}>
                      {renderInline(row[cellIndex] || '', `${key}-c-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      elements.push(
        <blockquote className={styles.blockquote} key={key}>
          {renderInline(quoteLines.join(' '), `${key}-quote`)}
        </blockquote>
      );
      continue;
    }

    if (UNORDERED_LIST_RE.test(line) || ORDERED_LIST_RE.test(line)) {
      const ordered = ORDERED_LIST_RE.test(line);
      const items: string[] = [];
      const matcher = ordered ? ORDERED_LIST_RE : UNORDERED_LIST_RE;
      while (index < lines.length) {
        const itemMatch = lines[index].match(matcher);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1]);
        index += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      elements.push(
        <ListTag className={styles.list} key={key}>
          {items.map((item, itemIndex) => (
            <li key={`${key}-li-${itemIndex}`}>
              {renderInline(item, `${key}-li-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      );
      continue;
    }

    const imageMatch = trimmed.match(MARKDOWN_IMAGE_RE);
    if (imageMatch) {
      elements.push(renderImage(imageMatch[2], imageMatch[1] || '', key));
      index += 1;
      continue;
    }

    if (/^https?:\/\//i.test(trimmed) && isImageUrl(trimmed)) {
      elements.push(renderImage(trimmed, '', key));
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    elements.push(
      <p className={styles.paragraph} key={key}>
        {renderInline(paragraphLines.join(' '), `${key}-p`)}
      </p>
    );
  }

  return <div className={styles.reportMarkdown}>{elements}</div>;
}
