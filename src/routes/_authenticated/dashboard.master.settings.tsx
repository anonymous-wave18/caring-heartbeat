import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/master/settings")({
  component: () => (
    <div className="rounded-xl bg-surface p-8 text-center ring-1 ring-border">
      <h2 className="text-lg font-medium">Configurações Master</h2>
      <p className="mt-2 text-sm text-muted-foreground">Funcionalidade em desenvolvimento.</p>
    </div>
  ),
});
