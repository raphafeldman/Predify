import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { getPeriodKey } from './frequency';
import { uploadPhotos } from './storage';
import { supabase } from './supabase';
import type { ChecklistEntry, ChecklistTemplate } from './types';

// Rotina do usuário logado — itens de checklist atribuídos a ele, ou sem
// atribuição (que aparecem pra todo mundo). Usado tanto pela home do
// funcionário quanto pela do síndico, já que os dois interagem com a
// própria rotina do mesmo jeito (Manutenção e Rotina continuam
// compartilhadas pra toda a equipe, de propósito).
export function useRotinaChecklist() {
  const { session, profile } = useAuth();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: templatesData } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('active', true)
      .order('title');

    const myTemplates = ((templatesData as ChecklistTemplate[]) ?? []).filter(
      (t) => !t.assigned_to || t.assigned_to === session?.user.id
    );
    setTemplates(myTemplates);

    if (myTemplates.length > 0) {
      const { data: entriesData } = await supabase
        .from('checklist_entries')
        .select('*')
        .in(
          'template_id',
          myTemplates.map((t) => t.id)
        );
      setEntries((entriesData as ChecklistEntry[]) ?? []);
    } else {
      setEntries([]);
    }
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function entryFor(template: ChecklistTemplate) {
    const periodKey = getPeriodKey(template.frequency);
    return entries.find((e) => e.template_id === template.id && e.entry_date === periodKey);
  }

  async function toggleChecklist(template: ChecklistTemplate) {
    const periodKey = getPeriodKey(template.frequency);
    const current = entryFor(template);
    const nextDone = !current?.done;
    await supabase.from('checklist_entries').upsert(
      {
        template_id: template.id,
        entry_date: periodKey,
        done: nextDone,
        done_by: session?.user.id ?? null,
        done_at: nextDone ? new Date().toISOString() : null,
      },
      { onConflict: 'template_id,entry_date' }
    );
    load();
  }

  async function saveChecklistDetails(template: ChecklistTemplate, notes: string, newPhotoUris: string[]) {
    if (!session || !profile) return;
    const periodKey = getPeriodKey(template.frequency);
    const current = entryFor(template);
    const uploadedPaths = newPhotoUris.length
      ? await uploadPhotos(newPhotoUris, 'checklist', session.user.id, profile.condominio_id)
      : [];
    await supabase.from('checklist_entries').upsert(
      {
        template_id: template.id,
        entry_date: periodKey,
        notes: notes.trim() || null,
        photo_urls: [...(current?.photo_urls ?? []), ...uploadedPaths],
      },
      { onConflict: 'template_id,entry_date' }
    );
    load();
  }

  const doneCount = templates.filter((t) => entryFor(t)?.done).length;

  return { templates, entries, loading, entryFor, toggleChecklist, saveChecklistDetails, doneCount, reload: load };
}
