"use client";

// IndexedDB persistence layer for unuploaded audio blobs.
// Written to immediately on recording stop — before any upload attempt —
// so the recording survives network drops, tab closes, and token failures.
//
// Uses the `idb` wrapper for clean async/await IndexedDB access.

import { openDB, type IDBPDatabase } from "idb";
import type { PendingUpload } from "@/types";

const DB_NAME = "odio-recordings";
const STORE = "pending-uploads";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "tempId" });
        }
      },
    });
  }
  return dbPromise;
}

/** Save a new pending upload. Call immediately after recording stops. */
export async function savePendingUpload(upload: PendingUpload): Promise<void> {
  const db = await getDb();
  await db.put(STORE, upload);
}

/** Update fields on an existing pending upload (e.g. uploadSessionUrl, byteOffset, status). */
export async function updatePendingUpload(
  tempId: string,
  patch: Partial<PendingUpload>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE, tempId);
  if (!existing) return;
  await db.put(STORE, { ...existing, ...patch });
}

/** Get all pending uploads. Called on app mount to surface the recovery banner. */
export async function getAllPendingUploads(): Promise<PendingUpload[]> {
  const db = await getDb();
  return db.getAll(STORE);
}

/** Get a single pending upload by tempId. */
export async function getPendingUpload(
  tempId: string,
): Promise<PendingUpload | undefined> {
  const db = await getDb();
  return db.get(STORE, tempId);
}

/** Remove a pending upload after successful Postgres + Drive write. */
export async function deletePendingUpload(tempId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, tempId);
}

/** Trigger browser download of the blob as a fallback if upload is unrecoverable. */
export function downloadBlobToDevice(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
