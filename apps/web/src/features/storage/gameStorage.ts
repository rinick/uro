import {countMoves, getGameInfo, parseSgf, serializeSgf, type SgfDocument} from '@ulugo/sgf-core';

export interface StoredGameSummary {
  id: string;
  gameName: string;
  date: string;
  blackPlayer: string;
  whitePlayer: string;
  result: string;
  moveCount: number;
  updatedAt: number;
}

interface StoredGameRecord extends StoredGameSummary {
  sgf: string;
}

const databaseName = 'ulugo-sgf-editor';
const storeName = 'games';

export async function saveStoredGame(document: SgfDocument, existingId?: string | null): Promise<string> {
  const db = await openDatabase();
  const info = getGameInfo(document);
  const id = existingId ?? crypto.randomUUID();
  const record: StoredGameRecord = {
    id,
    gameName: info.GN || 'Untitled game',
    date: info.DT || '',
    blackPlayer: info.PB || '',
    whitePlayer: info.PW || '',
    result: info.RE || '',
    moveCount: countMoves(document),
    updatedAt: Date.now(),
    sgf: serializeSgf(document),
  };

  await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).put(record));
  db.close();
  return id;
}

export async function listStoredGames(): Promise<StoredGameSummary[]> {
  const db = await openDatabase();
  const records = await requestToPromise<StoredGameRecord[]>(
    db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
  );
  db.close();
  return records
    .map(({sgf, ...summary}) => ({...summary, moveCount: summary.moveCount ?? countMoves(parseSgf(sgf))}))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function loadStoredGame(id: string): Promise<SgfDocument> {
  const db = await openDatabase();
  const record = await requestToPromise<StoredGameRecord | undefined>(
    db.transaction(storeName, 'readonly').objectStore(storeName).get(id)
  );
  db.close();

  if (record == null) throw new Error('Saved game was not found.');
  return parseSgf(record.sgf);
}

export async function deleteStoredGame(id: string): Promise<void> {
  const db = await openDatabase();
  await requestToPromise(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id));
  db.close();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, {keyPath: 'id'});
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
