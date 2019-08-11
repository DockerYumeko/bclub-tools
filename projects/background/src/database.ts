import { IEnrichedChatRoomMessage, openDatabase, IChatLog } from '../../../models';

export async function writeChatLog(data: IEnrichedChatRoomMessage) {
  const db = await openDatabase();
  const transaction = db.transaction('chatRoomLogs', 'readwrite');
  transaction.addEventListener('error', () => {
    console.error('Error during transaction');
    console.error(transaction.error);
  });

  const chatLogs = transaction.objectStore('chatRoomLogs');
  const senderChar = data.ChatRoom.Character.find(c => c.MemberNumber === data.Sender);
  const chatLog = {
    chatRoom: data.ChatRoom.Name,
    content: data.Content,
    sender: {
      id: data.Sender,
      name: senderChar.Name,
      color: senderChar.LabelColor,
    },
    session: {
      id: data.SessionId,
      name: data.PlayerName,
      memberNumber: data.MemberNumber
    },
    timestamp: new Date(data.Timestamp),
    type: data.Type
  } as IChatLog;

  const request = chatLogs.add(chatLog);
  request.addEventListener('error', () => {
    console.error('Error while writing chat log');
    console.error(request.error);
  });
}
