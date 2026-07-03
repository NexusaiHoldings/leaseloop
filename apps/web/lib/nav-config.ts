export const NAV_CONFIG = {
  primary: [
    { href: "/dashboard", label: "Operations Dashboard" },
    { href: "/conversations", label: "Conversation Transcripts" },
    { href: "/properties", label: "Property + Unit Configuration" },
  ],
  groups: [
    {
      label: "Admin",
      items: [
        { href: "/admin/vendors", label: "Vendor Roster" },
        { href: "/admin/pms", label: "PMS Integration Config" },
      ],
    },
  ],
} as const;
