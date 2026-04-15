"use client";
// useClipRename — inline rename state machine for a clip.
// Single responsibility: manage the edit-in-place flow and PATCH the name.
//
// Usage:
//   const rename = useClipRename(clip.id, clip.name);
//   // In JSX: bind rename.editingName / rename.name / rename.nameInput / handlers

import { useState } from "react";

interface UseClipRenameReturn {
  name: string;
  editingName: boolean;
  nameInput: string;
  saving: boolean;
  setNameInput: (v: string) => void;
  startEditing: () => void;
  cancelEditing: () => void;
  confirmEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function useClipRename(clipId: string, initialName: string): UseClipRenameReturn {
  const [name, setName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function save(newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clips/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) setName(trimmed);
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    setNameInput(name);
    setEditingName(true);
  }

  function cancelEditing() {
    setNameInput(name);
    setEditingName(false);
  }

  function confirmEdit() {
    save(nameInput);
    setEditingName(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEditing();
  }

  return {
    name,
    editingName,
    nameInput,
    saving,
    setNameInput,
    startEditing,
    cancelEditing,
    confirmEdit,
    handleKeyDown,
  };
}
