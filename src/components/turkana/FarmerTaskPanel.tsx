import { CheckCircle2, Mic } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { farmerCopy, type FarmerLang } from "@/lib/farmer-locale";

export type CoachItem = {
  id: string;
  task: string;
  completed: boolean;
  how?: string;
  afterEffect?: string;
};

export function FarmerTaskPanel({
  lang,
  todo,
  done,
  pendingId,
  almaBusy,
  onToggle,
  onSpeakTask,
}: {
  lang: FarmerLang;
  todo: CoachItem[];
  done: CoachItem[];
  pendingId: string | null;
  almaBusy: boolean;
  onToggle: (item: CoachItem, completed: boolean) => void;
  onSpeakTask: (id: string) => void;
}) {
  const copy = farmerCopy(lang);
  const total = todo.length + done.length;

  return (
    <div className="space-y-6">
      <p className="text-base font-bold">{copy.doneOf(done.length, total)}</p>

      <section>
        <h2 className="text-base font-bold">{copy.stillTodo}</h2>
        {todo.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/80">{copy.allDone}</p>
        ) : (
          <Accordion type="single" collapsible className="mt-1">
            {todo.map((item) => (
              <AccordionItem key={item.id} value={item.id} className="border-border">
                <div className="flex items-start gap-3 pt-3">
                  <Checkbox
                    id={`todo-${item.id}`}
                    checked={item.completed}
                    disabled={pendingId === item.id}
                    onCheckedChange={(v) => onToggle(item, Boolean(v))}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1"
                  />
                  <AccordionTrigger className="py-0 text-sm font-bold leading-snug hover:no-underline">
                    {item.task}
                  </AccordionTrigger>
                </div>
                <AccordionContent className="pl-8">
                  <p className="text-xs font-bold">{copy.how}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.how || item.task}</p>
                  <p className="mt-3 text-xs font-bold">{copy.afterThis}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.afterEffect || copy.allDone}</p>
                  <button
                    type="button"
                    disabled={almaBusy}
                    onClick={() => onSpeakTask(item.id)}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-act"
                  >
                    <Mic className="h-4 w-4" aria-hidden />
                    {copy.talkAlma}
                  </button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold">{copy.alreadyDone}</h2>
        {done.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/80">{copy.stillTodo}.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {done.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-act" aria-hidden />
                <div>
                  <p className="text-sm font-medium leading-snug">{item.task}</p>
                  {item.afterEffect ? (
                    <p className="mt-1 text-sm text-foreground/80">{item.afterEffect}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
