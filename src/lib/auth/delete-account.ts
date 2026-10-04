import "server-only";

import {
  classifyOwnedBeatsForDelete,
  filterPrivateStorageKeysToDelete,
} from "@/lib/auth/delete-account-policy";
import { ANONYMIZED_PUBLIC_AUTHOR } from "@/lib/auth/display-name";
import { reauthenticateWithPassword } from "@/lib/auth/reauth";
import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; step?: string };

const USER_PREFIX = (userId: string) => `user/${userId}/`;

type OwnedBeatRow = {
  id: string;
  status: string;
  ownership_type: string;
  owner_id: string | null;
};

type AssetRow = {
  id: string;
  beat_id: string;
  object_key: string | null;
  storage_bucket: string | null;
};

/**
 * ACCOUNT/PROFILE-01 — canonical deletion core.
 * No password reauth, no session identity, no signOut.
 * Callers must authorize. Auth delete is LAST.
 */
export async function executeAccountProfile01Deletion(
  userId: string,
): Promise<DeleteAccountResult> {
  const admin = createSupabaseAdminClient();

  try {
    const { data: ownedBeats, error: beatsErr } = await admin
      .from("beats")
      .select("id, status, ownership_type, owner_id")
      .eq("owner_id", userId)
      .eq("ownership_type", "USER");

    if (beatsErr) {
      return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "classify_beats" };
    }

    const beats = (ownedBeats ?? []) as OwnedBeatRow[];
    const { retainIds: retainBeatIds, deleteIds: deleteBeatIds } =
      classifyOwnedBeatsForDelete(
        beats.map((b) => ({
          id: b.id,
          status: b.status,
          ownershipType: b.ownership_type,
        })),
      );

    const retainedKeys = new Set<string>();
    if (retainBeatIds.length > 0) {
      const { data: retainAssets, error: raErr } = await admin
        .from("beat_audio_assets")
        .select("id, beat_id, object_key, storage_bucket")
        .in("beat_id", retainBeatIds);

      if (raErr) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "classify_assets" };
      }
      for (const row of (retainAssets ?? []) as AssetRow[]) {
        if (row.object_key && row.storage_bucket === BEAT_AUDIO_BUCKET) {
          retainedKeys.add(row.object_key);
        }
      }
    }

    {
      const { error } = await admin
        .from("beat_download_reservations")
        .delete()
        .eq("user_id", userId);
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "downloads_reservations" };
      }
    }
    {
      const { error } = await admin
        .from("beat_download_events")
        .delete()
        .eq("user_id", userId);
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "downloads_events" };
      }
    }

    if (deleteBeatIds.length > 0) {
      const { error: r1 } = await admin
        .from("beat_download_reservations")
        .delete()
        .in("beat_id", deleteBeatIds);
      if (r1) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "downloads_beat_res" };
      }
      const { error: r2 } = await admin
        .from("beat_download_events")
        .delete()
        .in("beat_id", deleteBeatIds);
      if (r2) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "downloads_beat_ev" };
      }
    }

    {
      const { error } = await admin
        .from("beat_access_grants")
        .delete()
        .eq("granted_by", userId);
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "grants_by" };
      }
    }
    {
      const { error } = await admin
        .from("beat_access_grants")
        .delete()
        .eq("grantee_user_id", userId);
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "grants_to" };
      }
    }

    await deleteOwnedAudioPipeline(admin, userId);

    {
      const { data: takes, error: tErr } = await admin
        .from("takes")
        .select("id, object_key, storage_bucket")
        .eq("owner_id", userId);
      if (tErr) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "takes_list" };
      }
      const takeKeys: string[] = [];
      for (const t of takes ?? []) {
        if (
          t.storage_bucket === TAKE_AUDIO_BUCKET &&
          typeof t.object_key === "string" &&
          t.object_key.startsWith(USER_PREFIX(userId))
        ) {
          takeKeys.push(t.object_key);
        }
      }
      if (takeKeys.length > 0) {
        await admin.storage.from(TAKE_AUDIO_BUCKET).remove(takeKeys);
      }
      const { error: delTakes } = await admin
        .from("takes")
        .delete()
        .eq("owner_id", userId);
      if (delTakes) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "takes_delete" };
      }
    }

    {
      const { error } = await admin
        .from("premium_entitlements")
        .delete()
        .eq("user_id", userId);
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "premium" };
      }
    }

    if (deleteBeatIds.length > 0) {
      const { data: delAssets } = await admin
        .from("beat_audio_assets")
        .select("id, beat_id, object_key, storage_bucket")
        .in("beat_id", deleteBeatIds);

      const keysToRemove: string[] = [];
      for (const row of (delAssets ?? []) as AssetRow[]) {
        if (
          row.object_key &&
          row.storage_bucket === BEAT_AUDIO_BUCKET &&
          row.object_key.startsWith(USER_PREFIX(userId)) &&
          !retainedKeys.has(row.object_key)
        ) {
          keysToRemove.push(row.object_key);
        }
      }
      if (keysToRemove.length > 0) {
        await admin.storage.from(BEAT_AUDIO_BUCKET).remove(keysToRemove);
      }

      const { error: aDel } = await admin
        .from("beat_audio_assets")
        .delete()
        .in("beat_id", deleteBeatIds);
      if (aDel) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "assets_delete" };
      }

      const { error: bDel } = await admin
        .from("beats")
        .delete()
        .in("id", deleteBeatIds)
        .eq("owner_id", userId);
      if (bDel) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "beats_delete" };
      }
    }

    {
      const { error } = await admin
        .from("beat_audio_assets")
        .update({ created_by: null })
        .eq("created_by", userId);
      if (error) {
        return {
          ok: false,
          error: "Nie udało się przygotować usunięcia.",
          step: "created_by_nullify",
        };
      }
    }

    if (retainBeatIds.length > 0) {
      const { error } = await admin
        .from("beats")
        .update({
          producer: ANONYMIZED_PUBLIC_AUTHOR,
          owner_id: null,
        })
        .in("id", retainBeatIds)
        .eq("owner_id", userId)
        .eq("ownership_type", "USER");
      if (error) {
        return { ok: false, error: "Nie udało się przygotować usunięcia.", step: "anonymize" };
      }
    }

    await selectiveUserStorageCleanup(admin, userId, retainedKeys);

    const { error: authDel } = await admin.auth.admin.deleteUser(userId);
    if (authDel) {
      return {
        ok: false,
        error: "Nie udało się usunąć konta. Skontaktuj się z supportem.",
        step: "auth_delete",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Nie udało się usunąć konta. Spróbuj ponownie.",
      step: "unexpected",
    };
  }
}

/**
 * ACCOUNT/PROFILE-01 — self-delete. Session + password reauth, then canonical core, then signOut.
 */
export async function deleteOwnAccount(params: {
  currentPassword: string;
}): Promise<DeleteAccountResult> {
  const reauth = await reauthenticateWithPassword(params.currentPassword);
  if (!reauth.ok) {
    return { ok: false, error: reauth.error, step: "reauth" };
  }

  const deleted = await executeAccountProfile01Deletion(reauth.user.id);
  if (!deleted.ok) {
    return deleted;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true };
}

async function deleteOwnedAudioPipeline(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<void> {
  const { data: jobs } = await admin
    .from("render_jobs")
    .select("id")
    .eq("owner_id", userId);
  const jobIds = (jobs ?? []).map((j) => j.id as string);

  if (jobIds.length > 0) {
    const { data: artifacts } = await admin
      .from("audio_artifacts")
      .select("id, object_key, storage_bucket")
      .eq("owner_id", userId);
    const artKeys: string[] = [];
    for (const a of artifacts ?? []) {
      if (
        a.storage_bucket === AUDIO_ARTIFACTS_BUCKET &&
        typeof a.object_key === "string" &&
        a.object_key.startsWith(USER_PREFIX(userId))
      ) {
        artKeys.push(a.object_key);
      }
    }
    if (artKeys.length > 0) {
      await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove(artKeys);
    }
    await admin.from("audio_artifacts").delete().eq("owner_id", userId);
    await admin.from("render_jobs").delete().eq("owner_id", userId);
  } else {
    await admin.from("audio_artifacts").delete().eq("owner_id", userId);
    await admin.from("render_jobs").delete().eq("owner_id", userId);
  }

  await admin.from("mix_sessions").delete().eq("owner_id", userId);
}

async function selectiveUserStorageCleanup(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  retainedKeys: ReadonlySet<string>,
): Promise<void> {
  const prefix = USER_PREFIX(userId);
  const buckets = [BEAT_AUDIO_BUCKET, TAKE_AUDIO_BUCKET, AUDIO_ARTIFACTS_BUCKET] as const;

  for (const bucket of buckets) {
    const keys = await listAllKeysUnderPrefix(admin, bucket, prefix);
    const toDelete = filterPrivateStorageKeysToDelete({
      userId,
      candidateKeys: keys,
      retainedKeys,
    });
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      if (chunk.length > 0) {
        await admin.storage.from(bucket).remove(chunk);
      }
    }
  }
}

async function listAllKeysUnderPrefix(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const root = prefix.replace(/\/$/, "");

  async function walk(path: string): Promise<void> {
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(path, {
        limit,
        offset,
      });
      if (error || !data || data.length === 0) break;
      for (const item of data) {
        const full = path ? `${path}/${item.name}` : item.name;
        if (item.id == null) {
          await walk(full);
        } else if (full.startsWith(prefix)) {
          out.push(full);
        }
      }
      if (data.length < limit) break;
      offset += limit;
    }
  }

  await walk(root);
  return out;
}
