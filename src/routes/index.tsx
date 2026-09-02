import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Video, Trash2, Pencil, FileText } from "lucide-react";
import {
  deleteScript,
  loadScripts,
  newId,
  upsertScript,
  type Script,
} from "@/lib/scripts-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teleprompter Personal — Graba leyendo tu guion" },
      {
        name: "description",
        content:
          "Graba vídeos con la cámara del móvil mientras lees tu guion en un teleprompter superpuesto: velocidad, tamaño, modo espejo y descarga directa.",
      },
      { property: "og:title", content: "Teleprompter Personal" },
      {
        property: "og:description",
        content:
          "Guiones guardados en tu móvil y teleprompter superpuesto sobre la cámara mientras grabas.",
      },
    ],
  }),
  component: ScriptsPage,
});

function ScriptsPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    setScripts(loadScripts());
  }, []);

  function refresh() {
    setScripts(loadScripts());
  }

  function openNew() {
    setEditing(null);
    setTitle("");
    setBody("");
    setOpen(true);
  }

  function openEdit(s: Script) {
    setEditing(s);
    setTitle(s.title);
    setBody(s.body);
    setOpen(true);
  }

  function save() {
    const text = body.trim();
    if (!text) return;
    upsertScript({
      id: editing?.id ?? newId(),
      title: title.trim() || "Guion sin título",
      body: text,
      updatedAt: Date.now(),
    });
    setOpen(false);
    refresh();
  }

  function remove(id: string) {
    deleteScript(id);
    refresh();
  }

  return (
    <main className="min-h-screen bg-background safe-x safe-top pb-32">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Teleprompter
          </p>
          <h1 className="truncate text-3xl font-extrabold">Mis guiones</h1>
        </div>
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <FileText className="size-6" />
        </div>
      </header>

      {scripts.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
          <h2 className="text-lg font-bold">Aún no hay guiones</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea uno pegando tu texto y grábate leyéndolo con el teleprompter sobre la
            cámara.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {scripts.map((s) => (
            <li
              key={s.id}
              className="rounded-3xl border border-border bg-card p-4 shadow-lg shadow-black/20"
            >
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{s.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.body}</p>
                <p className="mt-2 text-xs text-muted-foreground/70">
                  {s.body.trim().split(/\s+/).length} palabras ·{" "}
                  {new Date(s.updatedAt).toLocaleDateString("es-ES")}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  className="h-12 flex-1 rounded-2xl text-base font-bold"
                  onClick={() => router.navigate({ to: "/grabar/$id", params: { id: s.id } })}
                >
                  <Video className="size-5" /> Grabar
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-12 rounded-2xl"
                  aria-label={`Editar ${s.title}`}
                  onClick={() => openEdit(s)}
                >
                  <Pencil className="size-5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-12 rounded-2xl text-destructive"
                  aria-label={`Borrar ${s.title}`}
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="size-5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 safe-bottom safe-x bg-gradient-to-t from-background via-background to-transparent pt-8">
        <Button
          className="h-16 w-full rounded-3xl text-lg font-extrabold"
          onClick={openNew}
        >
          <Plus className="size-6" /> Nuevo guion
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar guion" : "Nuevo guion"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
              className="h-12 rounded-2xl"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Pega o escribe aquí tu guion…"
              className="min-h-56 rounded-2xl text-base"
            />
          </div>
          <DialogFooter>
            <Button className="h-12 w-full rounded-2xl text-base font-bold" onClick={save}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="sr-only">
        <Link to="/">Inicio</Link>
      </p>
    </main>
  );
}
