"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./SessionCard.module.css";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";

export function DeleteSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function deleteSession() {
    if (isDeleting) return;
    const confirmed = window.confirm(`Delete ${label}? This removes the session and its samples.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Delete failed with ${res.status}`);
      }
      router.refresh();
    } catch {
      window.alert("Could not delete this session. Check that the API is running, then try again.");
      setIsDeleting(false);
    }
  }

  return (
    <button className={styles.deleteBtn} onClick={deleteSession} disabled={isDeleting}>
      {isDeleting ? "Deleting" : "Delete"}
    </button>
  );
}
