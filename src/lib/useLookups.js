import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Loads members and projects once and provides name/id lookup maps.
// Shared across pages to avoid redundant fetches.
export function useLookups() {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [m, p] = await Promise.all([
          base44.entities.Member.list(),
          base44.entities.Project.list(),
        ]);
        if (!active) return;
        setMembers(m);
        setProjects(p);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const memberName = (id) => members.find((x) => x.id === id)?.name || "—";
  const memberById = (id) => members.find((x) => x.id === id);
  const projectName = (id) => projects.find((x) => x.id === id)?.name || "—";
  const projectById = (id) => projects.find((x) => x.id === id);

  return { members, projects, loading, memberName, memberById, projectName, projectById };
}