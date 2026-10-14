import type { Components } from 'react-markdown';

/**
 * How model-written Markdown is rendered anywhere in the app: no links and no images. A link could point anywhere and an
 * image is fetched the moment it is shown (a tracking beacon), so the words are kept and the link or picture is dropped.
 * The Ask page adds its own citation chips on top of this.
 */
export const safeMarkdownComponents: Components = {
    a: ({ children }) => <span>{children}</span>,
    img: () => null,
};
