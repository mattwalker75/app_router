/**
 * The data model, used by the server and the page.
 *
 * A link is one tile on the page. It either points at an app on the SAME
 * computer as App Router (a port, plus an optional path — the page fills in
 * whatever name you used to reach App Router), or at a full address somewhere
 * else. Directories group links the way bookmark folders do, to any depth;
 * a link with no directory sits on the main page.
 */
export interface Directory {
  id: string;
  name: string;
  /** null = a top-level directory on the main page */
  parentId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type OpenIn = "new" | "same";

export interface LinkIcon {
  /** up to 3 characters shown on the tile when there is no picture ("" = made from the name) */
  text: string;
  /** tile colour as #rrggbb ("" = picked from the name) */
  color: string;
  /** file name of an uploaded picture in the icons folder, or null */
  image: string | null;
}

export interface LinkHealthSettings {
  enabled: boolean;
  /** what to check instead of the link itself: a path ("/api/health") or a full address; "" = the link */
  path: string;
}

export interface Link {
  id: string;
  name: string;
  description: string;
  /** null = on the main page */
  directoryId: string | null;
  position: number;
  /** true = the app runs on the same computer as App Router */
  local: boolean;
  /** local links only */
  scheme: "http" | "https";
  /** local: the app's port. elsewhere: an optional port that replaces the one in the address */
  port: number | null;
  /** local links only: where in the app to land ("" = its front page) */
  path: string;
  /** links elsewhere: the full address */
  url: string;
  openIn: OpenIn;
  icon: LinkIcon;
  health: LinkHealthSettings;
  createdAt: string;
  updatedAt: string;
}

/** What the page sends to create or change a link (everything optional on a change). */
export type LinkInput = Partial<Omit<Link, "id" | "position" | "createdAt" | "updatedAt" | "icon" | "health">> & {
  icon?: Partial<Pick<LinkIcon, "text" | "color">>;
  health?: Partial<LinkHealthSettings>;
};

/** The file App Router keeps (data/links.json), and what export / import move around. */
export interface LinksDocument {
  format: "app-router-links";
  version: 1;
  directories: Directory[];
  links: Link[];
}

/**
 * The status light:
 *  online    – answering
 *  recovered – answering again after being down, within the "just back" time
 *  down      – not answering
 *  unchecked – health checks are off for this link (or for everything)
 *  pending   – on, but not checked yet
 */
export type Light = "online" | "recovered" | "down" | "unchecked" | "pending";

export interface LinkStatus {
  light: Light;
  /** when it entered its current state (went down, or came up) */
  since: string | null;
  checkedAt: string | null;
  /** how long the last answer took */
  ms: number | null;
  /** one plain sentence: "Answered in 18 ms", "No answer — nothing is listening on that port" */
  detail: string;
}

export interface StatusReport {
  enabled: boolean;
  checkedAt: string | null;
  intervalSeconds: number;
  links: Record<string, LinkStatus>;
}

export interface PageData {
  directories: Directory[];
  links: Link[];
}
