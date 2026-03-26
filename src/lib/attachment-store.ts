import {
  AttachmentRefBlock,
  ComposerAttachment,
  StoredAttachment,
} from '@/lib/chat-types';

const DB_NAME = 'claude-clone-attachments';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('当前环境不支持附件持久化');
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('打开附件数据库失败'));
    });
  }

  return dbPromise;
}

function withStore(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => void
) {
  return new Promise<void>((resolve, reject) => {
    void getIndexedDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('附件数据库操作失败'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('附件数据库操作被中止'));

        callback(store);
      })
      .catch(reject);
  });
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error(`读取文件 ${file.name} 失败`));

    reader.readAsDataURL(file);
  });
}

export async function saveComposerAttachment(params: {
  sessionId: string;
  messageId: string;
  attachment: ComposerAttachment;
}): Promise<AttachmentRefBlock> {
  if (params.attachment.source === 'existing') {
    return {
      type: 'attachment_ref',
      attachmentId: params.attachment.id,
      attachmentType: params.attachment.attachmentType,
      mediaType: params.attachment.mediaType,
      name: params.attachment.name,
      size: params.attachment.size,
    };
  }

  if (!params.attachment.file) {
    throw new Error(`附件 ${params.attachment.name} 缺少文件数据`);
  }

  const data = await readAsBase64(params.attachment.file);
  const record: StoredAttachment = {
    id: params.attachment.id,
    sessionId: params.sessionId,
    messageId: params.messageId,
    attachmentType: params.attachment.attachmentType,
    mediaType: params.attachment.mediaType,
    name: params.attachment.name,
    size: params.attachment.size,
    data,
    createdAt: new Date().toISOString(),
  };

  await withStore('readwrite', (store) => {
    store.put(record);
  });

  return {
    type: 'attachment_ref',
    attachmentId: record.id,
    attachmentType: record.attachmentType,
    mediaType: record.mediaType,
    name: record.name,
    size: record.size,
  };
}

export function getStoredAttachment(id: string) {
  return new Promise<StoredAttachment | null>((resolve, reject) => {
    void getIndexedDb()
      .then((db) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve((request.result as StoredAttachment) ?? null);
        request.onerror = () =>
          reject(request.error ?? new Error('读取附件失败'));
      })
      .catch(reject);
  });
}

export async function getStoredAttachmentDataUrl(id: string) {
  const attachment = await getStoredAttachment(id);
  if (!attachment) {
    return null;
  }

  return `data:${attachment.mediaType};base64,${attachment.data}`;
}

export function deleteAttachment(id: string) {
  return withStore('readwrite', (store) => {
    store.delete(id);
  });
}

export async function deleteAttachments(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  await withStore('readwrite', (store) => {
    for (const id of ids) {
      store.delete(id);
    }
  });
}

export async function deleteAttachmentsForSession(sessionId: string) {
  await withStore('readwrite', (store) => {
    const index = store.index('sessionId');
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }

      cursor.delete();
      cursor.continue();
    };
  });
}
