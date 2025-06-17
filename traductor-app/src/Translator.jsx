import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css"; // Importar CSS

const languages = [
  { code: "es", label: "Español", voice: "es-ES-ElviraNeural", locale: "es-ES" },
  { code: "en", label: "Inglés", voice: "en-US-JennyNeural", locale: "en-US" },
  { code: "fr", label: "Francés", voice: "fr-FR-DeniseNeural", locale: "fr-FR" },
  { code: "it", label: "Italiano", voice: "it-IT-ElsaNeural", locale: "it-IT" },
  { code: "de", label: "Alemán", voice: "de-DE-KatjaNeural", locale: "de-DE" },
  { code: "pt", label: "Portugués", voice: "pt-BR-FranciscaNeural", locale: "pt-BR" },
  { code: "ja", label: "Japonés", voice: "ja-JP-NanamiNeural", locale: "ja-JP" },
  { code: "ko", label: "Coreano", voice: "ko-KR-SunHiNeural", locale: "ko-KR" },
  { code: "zh-Hans", label: "Chino", voice: "zh-CN-XiaoxiaoNeural", locale: "zh-CN" },
  { code: "ar", label: "Árabe", voice: "ar-SA-ZariyahNeural", locale: "ar-SA" }
];

export default function Translator() {
  const [text, setText] = useState("");
  const [translated, setTranslated] = useState("");
  const [sourceLang, setSourceLang] = useState("es");
  const [targetLang, setTargetLang] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState({ source: false, target: false });
  const [speechProgress, setSpeechProgress] = useState({ current: 0, total: 0 });
  
  // Referencias para optimización
  const translateTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const audioRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Función ultra rápida de traducción con Google Translate
  const translateFast = useCallback(async (textToTranslate, fromLang, toLang) => {
    // Cancelar traducción anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`,
        { 
          signal: abortControllerRef.current.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }
      );
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data[0]?.map(item => item[0]).join('') || textToTranslate;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
  }, []);

  // Traducción con debounce optimizado
  const handleTranslate = useCallback(() => {
    if (!text.trim() || sourceLang === targetLang) {
      setTranslated("");
      return;
    }

    // Limpiar timeout anterior
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }

    // Debounce de solo 300ms para mayor rapidez
    translateTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      
      try {
        const result = await translateFast(text.trim(), sourceLang, targetLang);
        if (result !== null) {
          setTranslated(result);
        }
      } catch (err) {
        setError("Error de traducción");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [text, sourceLang, targetLang, translateFast]);

  // Auto-traducir cuando cambia el texto
  useEffect(() => {
    handleTranslate();
  }, [handleTranslate]);

  // Función para dividir texto en fragmentos manejables para TTS
  const splitTextForSpeech = useCallback((text, maxLength = 500) => {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    // Dividir por oraciones primero
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Si una oración es muy larga, dividir por palabras
          const words = sentence.split(" ");
          let wordChunk = "";
          for (const word of words) {
            if ((wordChunk + word).length <= maxLength) {
              wordChunk += (wordChunk ? " " : "") + word;
            } else {
              if (wordChunk) chunks.push(wordChunk.trim());
              wordChunk = word;
            }
          }
          if (wordChunk) currentChunk = wordChunk;
        }
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks.filter(chunk => chunk.length > 0);
  }, []);

  // Función de voz mejorada para textos largos
  const speakText = useCallback(async (textToSpeak, languageCode, isSource = true) => {
    if (!textToSpeak.trim() || !('speechSynthesis' in window)) {
      setError("No hay texto para reproducir o el navegador no soporta síntesis de voz");
      return;
    }

    // Detener audio anterior
    speechSynthesis.cancel();
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current = null;
    }

    const language = languages.find(lang => lang.code === languageCode);
    const chunks = splitTextForSpeech(textToSpeak);
    
    console.log(`Dividiendo texto en ${chunks.length} fragmentos para TTS`);
    
    setSpeaking(prev => ({ ...prev, [isSource ? 'source' : 'target']: true }));
    setSpeechProgress({ current: 0, total: chunks.length });

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setSpeechProgress({ current: i + 1, total: chunks.length });
        
        await new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(chunk);
          currentUtteranceRef.current = utterance;
          
          utterance.lang = language?.locale || 'en-US';
          utterance.rate = 0.85; // Velocidad más lenta y natural
          utterance.pitch = 1;
          utterance.volume = 1;

          utterance.onend = () => {
            currentUtteranceRef.current = null;
            resolve();
          };
          
          utterance.onerror = (event) => {
            console.error('Speech error:', event);
            currentUtteranceRef.current = null;
            reject(new Error(`Error de síntesis: ${event.error}`));
          };

          speechSynthesis.speak(utterance);
        });

        // Pausa pequeña entre fragmentos para que suene más natural
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {
      console.error('Error durante la síntesis completa:', error);
      setError(`Error reproduciendo audio: ${error.message}`);
    } finally {
      setSpeaking(prev => ({ ...prev, [isSource ? 'source' : 'target']: false }));
      setSpeechProgress({ current: 0, total: 0 });
    }
  }, [splitTextForSpeech]);

  // Intercambiar idiomas optimizado
  const swapLanguages = useCallback(() => {
    if (sourceLang === targetLang) return;
    
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    
    if (translated.trim()) {
      setText(translated);
      setTranslated(text);
    }
  }, [sourceLang, targetLang, text, translated]);

  // Detección rápida de idioma
  const detectLanguage = useCallback(async () => {
    if (!text.trim()) {
      setError("Escribe texto para detectar");
      return;
    }

    try {
      const sample = text.substring(0, 100);
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sample)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        const detectedLang = data[2];
        const supportedLang = languages.find(lang => lang.code === detectedLang);
        
        if (supportedLang) {
          setSourceLang(detectedLang);
          setError(`✓ ${supportedLang.label} detectado`);
          setTimeout(() => setError(""), 2000);
        }
      }
    } catch (err) {
      setError("Error detectando idioma");
      console.error(err);
    }
  }, [text]);

  // Detener audio
  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    if (currentUtteranceRef.current) {
      currentUtteranceRef.current = null;
    }
    setSpeaking({ source: false, target: false });
    setSpeechProgress({ current: 0, total: 0 });
  }, []);

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        swapLanguages();
      }
      // Detener audio con Escape
      if (e.key === 'Escape') {
        stopSpeaking();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      speechSynthesis.cancel();
      if (currentUtteranceRef.current) {
        currentUtteranceRef.current = null;
      }
    };
  }, [swapLanguages, stopSpeaking]);

  // Estadísticas memoizadas
  const stats = useMemo(() => ({
    chars: text.length,
    words: text.trim().split(/\s+/).filter(w => w).length
  }), [text]);

  return (
    <div className="translator-container">
      <h1> 🌐 Traductor </h1>

      {/* Selectores de idioma */}
      <div className="lang-select">
        <select 
          value={sourceLang} 
          onChange={(e) => setSourceLang(e.target.value)}
          disabled={loading}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>

        <button 
          onClick={swapLanguages}
          disabled={loading || sourceLang === targetLang}
          className="swap-button"
          title="Intercambiar idiomas (Ctrl+Shift+S)"
        >
          ⇄
        </button>

        <select 
          value={targetLang} 
          onChange={(e) => setTargetLang(e.target.value)}
          disabled={loading}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </div>

      {/* Área de texto de entrada con botón de pronunciación */}
      <div className="text-input-container">
        <textarea
          placeholder="Escribe aquí el texto a traducir (traducción automática)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button
          onClick={() => speakText(text, sourceLang, true)}
          disabled={!text.trim() || speaking.source || loading}
          className={`speak-button speak-source ${speaking.source ? 'speaking' : ''}`}
          title={speaking.source ? 
            `Reproduciendo fragmento ${speechProgress.current}/${speechProgress.total}...` : 
            "Escuchar texto original completo"
          }
        >
          {speaking.source ? "🔊" : "🔉"}
        </button>
        {speaking.source && speechProgress.total > 1 && (
          <div className="speech-progress">
            {speechProgress.current}/{speechProgress.total}
          </div>
        )}
      </div>

      <div className="button-group">
        <button 
          onClick={detectLanguage} 
          disabled={loading || !text.trim()}
          className="btn-secondary"
        >
          🔍 Detectar idioma
        </button>

        {(speaking.source || speaking.target) && (
          <button 
            onClick={stopSpeaking}
            className="btn-stop"
            title="Detener reproducción (Escape)"
          >
            ⏹️ Detener
          </button>
        )}
      </div>

      {/* Indicador de carga */}
      {loading && (
        <div className="progress-bar">
          ⚡ Traduciendo automáticamente...
        </div>
      )}

      {/* Progreso de síntesis de voz */}
      {(speaking.source || speaking.target) && speechProgress.total > 1 && (
        <div className="speech-progress-bar">
          <div className="progress-text">
            🔊 Reproduciendo fragmento {speechProgress.current} de {speechProgress.total}
          </div>
          <div className="progress-bar-fill">
            <div 
              className="progress-fill" 
              style={{ width: `${(speechProgress.current / speechProgress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Mensajes de error/éxito */}
      {error && (
        <div className={`error-message ${error.includes('✓') ? 'success' : 'error'}`}>
          <strong>{error.includes('✓') ? 'Éxito:' : 'Error:'}</strong> {error}
        </div>
      )}

      {/* Área de traducción con botón de pronunciación */}
      <div className="translated">
        <div className="translation-header">
          <strong>Traducción {loading && "⏳"}</strong>
          <button
            onClick={() => speakText(translated, targetLang, false)}
            disabled={!translated.trim() || speaking.target || loading}
            className={`speak-button speak-target ${speaking.target ? 'speaking' : ''}`}
            title={speaking.target ? 
              `Reproduciendo fragmento ${speechProgress.current}/${speechProgress.total}...` : 
              "Escuchar traducción completa"
            }
          >
            {speaking.target ? "🔊" : "🔉"}
          </button>
        </div>
        <div className="translation-output">
          <p>
            {translated || "La traducción aparecerá automáticamente cuando escribas..."}
          </p>
        </div>
      </div>

      <div className="info-footer">
        <p>⚡ Traductor con traducción automática instantánea</p>
        <p>💡 Usa Ctrl+Shift+S para intercambiar idiomas rápidamente</p>
        <p>🔊 Audio completo para textos largos • Escape para detener</p>
        <p>📊 Caracteres: {stats.chars} | Palabras: {stats.words}</p>
      </div>
    </div>
  );
}