import Chat from "@/components/Chat";
import Landing from "@/components/Landing";
import { HOSTED } from "@/lib/mode";

// On Mike's laptop the home page is the chat. On the hosted site it's the
// public landing page, and the chat lives at /demo behind the login.
export default function Home() {
  return HOSTED ? <Landing /> : <Chat />;
}
