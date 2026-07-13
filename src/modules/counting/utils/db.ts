import { CountingWorkspace } from "../types.ts";

const DB_NAME = "DanfoodsCycleCountingDB";
const STORE_NAME = "cc_workspaces";
const DB_VERSION = 1;

export function openCCDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB er ikke understøttet i denne browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      console.error("IndexedDB databaseåbningsfejl:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function saveWorkspace(workspace: CountingWorkspace): Promise<void> {
  const db = await openCCDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(workspace);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event: any) => {
      console.error("Fejl ved lagring af optælling:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function getWorkspace(id: string): Promise<CountingWorkspace | null> {
  const db = await openCCDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = (event: any) => {
      resolve(event.target.result || null);
    };

    request.onerror = (event: any) => {
      console.error("Fejl ved hentning af optælling:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function getAllWorkspaces(): Promise<CountingWorkspace[]> {
  const db = await openCCDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event: any) => {
      resolve(event.target.result || []);
    };

    request.onerror = (event: any) => {
      console.error("Fejl ved hentning af alle optællinger:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openCCDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event: any) => {
      console.error("Fejl ved sletning af optælling:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function clearAllWorkspaces(): Promise<void> {
  const db = await openCCDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event: any) => {
      console.error("Fejl ved rydning af lokale optællinger:", event.target.error);
      reject(event.target.error);
    };
  });
}
