import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

interface VersionInfo {
  serverStartTime: string;
}

export function AppFooter() {
  const { data } = useQuery<VersionInfo>({
    queryKey: ["/api/version"],
    staleTime: Infinity,
  });

  const formattedTime = data?.serverStartTime
    ? format(new Date(data.serverStartTime), "yyyy/MM/dd HH:mm", { locale: ja })
    : null;

  return (
    <footer className="shrink-0 border-t border-border/50 px-4 py-2 text-xs text-muted-foreground flex items-center justify-end">
      {formattedTime && (
        <span data-testid="text-last-update">Last update: {formattedTime}</span>
      )}
    </footer>
  );
}
