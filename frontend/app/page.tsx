import CouncilGame from './council-game';
import WebGame from './web-game';

export default function Home() {
  return process.env.NEXT_PUBLIC_ANDROID_BUILD === '1' ? <CouncilGame /> : <WebGame />;
}
