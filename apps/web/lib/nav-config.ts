export type NavLink = {
  label: string;
  href: string;
  description?: string;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

export type NavConfig = {
  primary: NavLink[];
  groups: NavGroup[];
};

export const NAV_CONFIG: NavConfig = {
  primary: [
    {
      label: "Operations Dashboard",
      href: "/dashboard",
      description: "Realtime portfolio pulse across occupancy, work orders, and sentiment.",
    },
    {
      label: "Conversation Transcripts",
      href: "/conversations",
      description: "Review AI tenant interactions, escalate threads, and track resolutions.",
    },
    {
      label: "Property & Units",
      href: "/properties",
      description: "Manage property records, unit availability, amenities, and automations.",
    },
  ],
  groups: [
    {
      label: "Administration",
      links: [
        {
          label: "Vendor Roster",
          href: "/admin/vendors",
          description: "Curate trusted vendors, escalation paths, and service-level contacts.",
        },
        {
          label: "PMS Integration Config",
          href: "/admin/pms",
          description: "Connect Yardi, AppFolio, and other PMS systems for unified data sync.",
        },
      ],
    },
  ],
};

export default NAV_CONFIG;
