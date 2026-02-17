import { useCallback, useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { Brand } from "@/constants/brand";

type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: string;
};

const SUPPORT_EMAIL = "xyz@gmail.cim";
const SUPPORT_PHONE = "+123 4 567 8900";

const cannedReplies = [
  "Thanks for reaching out. How can I help you today?",
  "Got it. We are checking this for you.",
  "If it is urgent, contact support by email or phone.",
];

export default function HelpCenterScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Hi, I am the AD5BET assistant. Ask me anything about your account or bets.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const replyIndex = useRef(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const now = new Date().toLocaleTimeString();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
      timestamp: now,
    };
    const reply = cannedReplies[replyIndex.current % cannedReplies.length];
    replyIndex.current += 1;
    const botMessage: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      role: "bot",
      text: reply,
      timestamp: now,
    };
    setMessages((current) => [...current, userMessage, botMessage]);
    setInput("");
  }, [input]);

  const chatItems = useMemo(
    () =>
      messages.map((message) => {
        const isUser = message.role === "user";
        return (
          <View
            key={message.id}
            style={[styles.chatBubble, isUser ? styles.chatUser : styles.chatBot]}
          >
            <Text style={[styles.chatText, isUser ? styles.chatUserText : styles.chatBotText]}>
              {message.text}
            </Text>
            <Text style={styles.chatTime}>{message.timestamp}</Text>
          </View>
        );
      }),
    [messages],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Help Center</Text>
        <Text style={styles.subtitle}>Get support fast and manage common issues.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contact Support</Text>
        <Text style={styles.cardCopy}>
          Contact our support on {SUPPORT_EMAIL} or {SUPPORT_PHONE}.
        </Text>
        <View style={styles.contactRow}>
          <MaterialIcons name="email" size={18} color={Brand.navy} />
          <Text style={styles.contactText}>{SUPPORT_EMAIL}</Text>
        </View>
        <View style={styles.contactRow}>
          <MaterialIcons name="phone" size={18} color={Brand.navy} />
          <Text style={styles.contactText}>{SUPPORT_PHONE}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Chat with us</Text>
        <Text style={styles.cardCopy}>Ask a question and we will respond quickly.</Text>
        <View style={styles.chatBox}>{chatItems}</View>
        <View style={styles.chatInputRow}>
          <TextInput
            placeholder="Type your message"
            placeholderTextColor={Brand.muted}
            value={input}
            onChangeText={setInput}
            style={styles.chatInput}
          />
          <Pressable style={styles.chatSend} onPress={sendMessage}>
            <MaterialIcons name="send" size={18} color={Brand.card} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: Brand.background,
    gap: 16,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Brand.navy,
  },
  subtitle: {
    marginTop: 6,
    color: Brand.muted,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 10,
  },
  cardTitle: {
    color: Brand.navy,
    fontSize: 16,
    fontWeight: "800",
  },
  cardCopy: {
    color: Brand.muted,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactText: {
    color: Brand.text,
    fontWeight: "600",
  },
  chatBox: {
    gap: 10,
    marginTop: 6,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: "86%",
    gap: 6,
  },
  chatUser: {
    alignSelf: "flex-end",
    backgroundColor: Brand.navy,
  },
  chatBot: {
    alignSelf: "flex-start",
    backgroundColor: Brand.background,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  chatText: {
    fontWeight: "600",
    fontSize: 13,
  },
  chatUserText: {
    color: Brand.card,
  },
  chatBotText: {
    color: Brand.text,
  },
  chatTime: {
    fontSize: 10,
    color: Brand.muted,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Brand.text,
    backgroundColor: Brand.background,
  },
  chatSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Brand.navy,
    alignItems: "center",
    justifyContent: "center",
  },
});
