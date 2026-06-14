export type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  author: {
    name: string;
    url: string;
  };
  links: {
    github: string;
  };
  /** Primary top-level links shown directly in the navbar. */
  navItems: NavItem[];
  /** Grouped destinations rendered as dropdown menus (desktop) / sections (mobile). */
  navGroups: NavGroup[];
};

export const siteConfig: SiteConfig = {
  name: "R2 SQL Analytics",
  description:
    "Analytics over the cslb-master-licenses-sql R2 Data Catalog warehouse — guarded R2 SQL queries, Workers AI NL→SQL, dashboards, and contractor/permit vetting.",
  url: "https://example.com",
  author: {
    name: "Author",
    url: "https://example.com",
  },
  links: {
    github: "https://github.com",
  },
  navItems: [
    { href: "/", label: "Warehouse" },
    { href: "/workbench", label: "Workbench" },
    { href: "/vetting", label: "Vetting" },
  ],
  navGroups: [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Demo Dashboard" },
        { href: "/projects", label: "Projects" },
        { href: "/tasks/board", label: "Task Board" },
        { href: "/tasks", label: "Tasks" },
        { href: "/notes", label: "Notes" },
        { href: "/analytics", label: "Analytics" },
      ],
    },
    {
      label: "Agents",
      items: [
        { href: "/chat", label: "Chat" },
        { href: "/showcase/code-mode", label: "Code Mode" },
        { href: "/showcase/browser-hitl", label: "Browser HITL" },
        { href: "/showcase/multi-agent", label: "Multi-Agent" },
        { href: "/showcase/workflows", label: "Workflows" },
        { href: "/showcase/artifacts", label: "Artifacts" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/notifications", label: "Notifications" },
        { href: "/admin/config", label: "Config Admin" },
        { href: "/settings", label: "Settings" },
        { href: "/playbook", label: "Playbook" },
        { href: "/openapi.json", label: "OpenAPI" },
        { href: "/swagger", label: "Swagger" },
        { href: "/scalar", label: "Scalar" },
      ],
    },
  ],
};
