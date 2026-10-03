/** Canonical frontend definition for the six student-catalog departments. Do not fetch or persist this list in Supabase. */
export const CATALOG_DOMAINS = [
  {
    "id": "engineering",
    "title": "Engineering & Technology",
    "icon": "Cpu",
    "description": "B.Tech in Computer Science, AI & ML, Mechanical, Civil, Electrical, and Chemical."
  },
  {
    "id": "computer-apps",
    "title": "Computer Applications",
    "icon": "LayoutGrid",
    "description": "BCA and MCA programs focusing on software development, database management, and modern web technologies."
  },
  {
    "id": "management",
    "title": "Management Studies",
    "icon": "Briefcase",
    "description": "BBA & B.Com programs with various specializations."
  },
  {
    "id": "science-pharmacy",
    "title": "Science & Pharmacy",
    "icon": "FlaskConical",
    "description": "B.Pharm and B.Sc programs."
  },
  {
    "id": "law-arts",
    "title": "Law & Arts",
    "icon": "Scale",
    "description": "Legal and Liberal Arts programs."
  },
  {
    "id": "diploma",
    "title": "Diploma in Engineering",
    "icon": "GraduationCap",
    "description": "Diploma courses across all engineering fields."
  }
];

export function getCatalogDomain(domainId) {
  return CATALOG_DOMAINS.find((d) => d.id === domainId) || null;
}