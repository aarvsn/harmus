import { useState, useEffect } from "react";
import { ModelRegistry } from "@harmus/core";

const registry = new ModelRegistry(); // shared singleton across palette renders

export interface LiveModel {
  id: string;
  provider: string;
  name: string;
}

export function useLiveModels(): { models: LiveModel[]; loading: boolean; error: string | null } {
  const [models, setModels] = useState<LiveModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    registry
      .listAll()
      .then((all) => {
        if (!cancelled) {
          setModels(all.map((m) => ({ id: m.id, provider: m.provider, name: m.name })));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading, error };
}
