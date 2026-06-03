"use client"

import { useEffect, useRef, useState } from "react"

export type VoiceInputState = "idle" | "listening" | "captured" | "unsupported"

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: (() => void) | null
  onerror: (() => void) | null
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

export function useVoiceInput(value: string, onTranscript: (value: string) => void) {
  const [voiceState, setVoiceState] = useState<VoiceInputState>("idle")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const valueBeforeListeningRef = useRef("")
  const hasCapturedTranscriptRef = useRef(false)

  useEffect(() => {
    const speechWindow = window as SpeechRecognitionWindow
    if (!speechWindow.SpeechRecognition && !speechWindow.webkitSpeechRecognition) {
      setVoiceState("unsupported")
    }

    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const toggleVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const speechWindow = window as SpeechRecognitionWindow
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceState("unsupported")
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = navigator.language || "en-US"
    valueBeforeListeningRef.current = value
    hasCapturedTranscriptRef.current = false

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return

      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim()

      if (!transcript) return

      const existingValue = valueBeforeListeningRef.current.trim()
      onTranscript(existingValue ? `${existingValue} ${transcript}` : transcript)
      hasCapturedTranscriptRef.current = true
      setVoiceState("captured")
    }
    recognition.onerror = () => {
      if (recognitionRef.current !== recognition) return
      recognitionRef.current = null
      setVoiceState("idle")
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return
      recognitionRef.current = null
      setVoiceState(hasCapturedTranscriptRef.current ? "captured" : "idle")
    }

    recognitionRef.current = recognition
    setVoiceState("listening")

    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setVoiceState("idle")
    }
  }

  return { voiceState, toggleVoiceInput }
}
