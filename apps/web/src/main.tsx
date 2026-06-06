import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import '@uro/react-shudan/css/goban.css';
import './styles/global.css';
import './features/localization/i18n';
import {App} from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
