import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Clock3, X } from 'lucide-react'

let detectorPromise
const fireworkColors = ['#fff176', '#ffd54f', '#ff8a65', '#80deea', '#ce93d8', '#a5d6a7']
const fireworkParticles = Array.from({ length: 24 }, (_, index) => ({
  angle: `${index * 15}deg`,
  distance: `${-(82 + ((index * 37) % 76))}px`,
  color: fireworkColors[index % fireworkColors.length],
}))

function loadPersonDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const [tensorflow, cocoSsd] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow-models/coco-ssd'),
      ])
      try {
        await tensorflow.setBackend('webgl')
      } catch {
        await tensorflow.setBackend('cpu')
      }
      await tensorflow.ready()
      return cocoSsd.load({ base: 'lite_mobilenet_v2' })
    })()
  }
  return detectorPromise
}

function FullscreenGame({
  question,
  remaining,
  phase,
  countdownText,
  cameraStream,
  zoneCounts,
  onClose,
  onZoneCounts,
}) {
  const videoRef = useRef(null)
  const [detectionStatus, setDetectionStatus] = useState('loading')
  const [detectionError, setDetectionError] = useState('')
  const onZoneCountsRef = useRef(onZoneCounts)

  useEffect(() => {
    onZoneCountsRef.current = onZoneCounts
  }, [onZoneCounts])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraStream) return undefined

    const startPlayback = () => {
      video.play().catch((error) => {
        if (error.name === 'AbortError') return
        console.error('Could not play the classroom camera stream:', error)
        setDetectionError('Video kamera belum dapat diputar. Periksa izin kamera browser.')
        setDetectionStatus('error')
      })
    }

    video.srcObject = cameraStream
    video.addEventListener('loadedmetadata', startPlayback)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) startPlayback()
    return () => video.removeEventListener('loadedmetadata', startPlayback)
  }, [cameraStream])

  useEffect(() => {
    if (phase !== 'countdown' || countdownText) return undefined

    let cancelled = false
    let timeoutId
    async function detectPeople() {
      try {
        const detector = await loadPersonDetector()
        if (cancelled) return
        setDetectionStatus('active')

        const detectNextFrame = async () => {
          const video = videoRef.current
          if (cancelled) return
          if (!video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
            timeoutId = window.setTimeout(detectNextFrame, 300)
            return
          }

          try {
            const detections = await detector.detect(video, 20, 0.45)
            if (cancelled) return
            let trueCount = 0
            let falseCount = 0
            for (const detection of detections) {
              if (detection.class !== 'person' || detection.score < 0.45) continue
              const [x, , width] = detection.bbox
              const mirroredCenter = 1 - (x + width / 2) / video.videoWidth
              if (mirroredCenter < 0.46) trueCount += 1
              if (mirroredCenter > 0.54) falseCount += 1
            }

            onZoneCountsRef.current({ trueCount, falseCount })
            timeoutId = window.setTimeout(detectNextFrame, 300)
          } catch (error) {
            console.error('Person detection failed during the camera stream:', error)
            if (!cancelled) {
              setDetectionStatus('error')
              setDetectionError('Hitungan orang berhenti. Permainan tetap dapat dilanjutkan.')
            }
          }
        }

        detectNextFrame()
      } catch (error) {
        console.error('On-device person detection could not start:', error)
        if (!cancelled) {
          setDetectionStatus('error')
          setDetectionError('Hitungan orang tidak tersedia. Periksa koneksi internet untuk memuat model deteksi.')
        }
      }
    }

    detectPeople()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [phase, countdownText])

  const answerIsTrue = phase === 'reveal' && question.answer
  const answerIsFalse = phase === 'reveal' && !question.answer
  return (
    <section className="immersive-game" aria-label="Permainan benar atau salah">
      <video ref={videoRef} className="immersive-video" autoPlay muted playsInline />
      <div className="immersive-shade" />

      <button className="immersive-exit" onClick={onClose} aria-label="Keluar dari permainan"><ArrowLeft size={18} /></button>

      <div className="immersive-question" aria-live="polite">
        <p>{question.statement}</p>
        {countdownText ? (
          <strong className="immersive-countdown immersive-start-count">{countdownText}</strong>
        ) : phase === 'countdown' ? (
          <strong className={`immersive-countdown ${remaining <= 3 ? 'urgent' : ''}`}><Clock3 size={18} /> {remaining}<small>detik</small></strong>
        ) : (
          <>
            <strong className={`immersive-answer-result ${question.answer ? 'correct-answer-result' : 'wrong-answer-result'}`}>
              {question.answer ? <><Check size={17} /> JAWABAN BENAR</> : <><X size={17} /> JAWABAN SALAH</>}
            </strong>
            {question.explanation && <span className="immersive-answer-explanation">{question.explanation}</span>}
          </>
        )}
      </div>

      <div className="immersive-zones">
        <section
          className={`immersive-zone zone-true ${answerIsTrue ? 'answer-correct' : ''} ${answerIsFalse ? 'answer-dimmed' : ''}`}
          aria-label={`Kotak Benar, ${zoneCounts.trueCount} orang`}
        >
          {answerIsTrue && <div className="zone-fireworks" aria-hidden="true">{fireworkParticles.map((particle, index) => <span key={index} className="zone-firework-particle" style={{ '--firework-angle': particle.angle, '--firework-distance': particle.distance, '--firework-color': particle.color }} />)}</div>}
          <span className="zone-choice"><Check size={22} /> BENAR</span>
          <strong className="zone-count">{zoneCounts.trueCount}</strong>
          <span className="zone-count-label">orang</span>
        </section>
        <section
          className={`immersive-zone zone-false ${answerIsFalse ? 'answer-correct' : ''} ${answerIsTrue ? 'answer-dimmed' : ''}`}
          aria-label={`Kotak Salah, ${zoneCounts.falseCount} orang`}
        >
          {answerIsFalse && <div className="zone-fireworks" aria-hidden="true">{fireworkParticles.map((particle, index) => <span key={index} className="zone-firework-particle" style={{ '--firework-angle': particle.angle, '--firework-distance': particle.distance, '--firework-color': particle.color }} />)}</div>}
          <span className="zone-choice"><X size={22} /> SALAH</span>
          <strong className="zone-count">{zoneCounts.falseCount}</strong>
          <span className="zone-count-label">orang</span>
        </section>
      </div>

      {detectionStatus === 'error' && <div className="immersive-camera-status" role="status"><CircleHelp size={14} /> {detectionError}</div>}
    </section>
  )
}

export default FullscreenGame
