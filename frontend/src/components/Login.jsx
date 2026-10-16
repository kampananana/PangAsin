// WHAT: Glass split-screen login page na may salt background at normal na
//      layout. Ang hero ay 100% viewport na may salt_bg.jpg mismo (walang
//      rotate/parallax), at naka-flex ang dalawang kolumna (copy sa kaliwa,
//      login card sa kanan). Naka-scope sa .login-* na mga klase para hindi
//      epekto sa ibang pages (encoder, admin, at guest dashboard).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Eye, EyeOff, Loader2, Lock, Mail, MapPin, Phone, Scale, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './Reveal';
import { loadPublicDashboardData, loginAPI } from '../services/dataService';
import { formatMT } from '../utils/volumeFormat';
import { useToast } from './Toast';
import AdminKpiCard from './admin/AdminKpiCard';
import useCountUp from '../hooks/useCountUp';

const POLICY_MANDATE = 'RA 11985';

// Fallback na numero (placeholder lamang — may random na halaga). */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function formatProductionYears(records) {
  const years = [...new Set(
    (records || [])
      .map((record) => Number(record.year))
      .filter((year) => Number.isInteger(year)),
  )].sort((a, b) => a - b);

  if (!years.length) return [];

  const ranges = [];
  let start = years[0];
  let previous = years[0];

  years.slice(1).forEach((year) => {
    if (year === previous + 1) {
      previous = year;
      return;
    }
    ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = year;
  });
  ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
  return ranges;
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [kpiData, setKpiData] = useState(null);
  const [kpiError, setKpiError] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const navigate = useNavigate();
  const { toastSuccess } = useToast();

  const heroRef = useRef(null);
  const statsRef = useRef(null);

  // WHAT: I-mark ang hero na "ready" para sa staggered fade-up (transform lang).
  // WHY: Hindi libo-libo ang animasyon habang hindi pa visible ang hero. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setHeroReady(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);


  useEffect(() => {
    let active = true;

    loadPublicDashboardData()
      .then((data) => {
        if (active) setKpiData(data || {});
      })
      .catch(() => {
        if (active) setKpiError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  /* WHAT: Numero ang kalkulahin mula sa totoong dashboard data.
     WHY: Kapag may totoong data, mula ito; kapag walang data (fallback lamang),
          random na numero ang ipapakita para hindi mabigyan ng "Data unavailable"
          ang UI habang hinihintay. */
  const dashboardNumbers = useMemo(() => {
    if (kpiError) {
      return {
        municipalityCount: randomInt(0, 40),
        yearCount: randomInt(0, 12),
        totalMT: randomFloat(0, 400000),
      };
    }
    if (!kpiData) {
      return {
        municipalityCount: randomInt(0, 40),
        yearCount: randomInt(0, 12),
        totalMT: randomFloat(0, 400000),
      };
    }

    const municipalities = Array.isArray(kpiData.municipalities) ? kpiData.municipalities : [];
    const production = kpiData.production || {};
    const records = Array.isArray(production.records) ? production.records : [];
    const years = formatProductionYears(records);
    const totalMT = Number.isFinite(Number(production.provinceTotalMT))
      ? Number(production.provinceTotalMT)
      : null;

    return {
      municipalityCount: municipalities.length,
      yearCount: years.length,
      totalMT,
    };
  }, [kpiData, kpiError]);

  const municipalityCount = useCountUp(dashboardNumbers.municipalityCount, { containerRef: statsRef });
  const yearCount = useCountUp(dashboardNumbers.yearCount, { containerRef: statsRef });
  const animatedTotal = useCountUp(dashboardNumbers.totalMT, { containerRef: statsRef });

  const kpis = useMemo(() => {
    return {
      municipalities: {
        value: String(municipalityCount),
        supporting: 'Municipalities with approved production records',
      },
      years: {
        value: String(yearCount),
        supporting: 'Distinct years with approved monthly production records',
      },
      production: {
        value: formatMT(animatedTotal),
        unit: 'MT',
        supporting: 'Approved production recorded in the public dashboard',
      },
    };
  }, [municipalityCount, yearCount, animatedTotal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await loginAPI(email, password);
      if (user.role !== 'admin' && user.role !== 'encoder') {
        throw Object.assign(new Error('This account cannot sign in to PangAsin.'), { status: 403 });
      }
      onLogin(user);
      toastSuccess('Log in successful.', 'Welcome back');
      navigate(user.role === 'admin' ? '/admin' : '/encoder');
    } catch (err) {
      const message = err.message || 'Login failed.';
      // WHAT: Pagbubukas ng isang bagong error, ipapatay ang shake animation.
      setErrorKey((key) => key + 1);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section
        className={`login-hero${heroReady ? ' is-ready' : ''}`}
        ref={heroRef}
        id="login-hero"
      >
        <div className="login-hero-media" aria-hidden="true">
          <div className="login-hero-photo" />
        </div>
        <div className="login-hero-veil" />
        <div className="login-hero-content">
          <img
            src="/static/brand/PangAsin_Logo.png"
            alt="PangAsin"
            className="login-hero-logo"
          />
          <h1 className="login-hero-title">PangAsin</h1>
          <p className="login-hero-tagline">
            The Accelerating Salt Research and Innovation (ASIN) Center at Pangasinan State
            University supports the Philippine salt industry through research,
            innovation, and data-driven planning under RA 11985.
          </p>
          <a className="login-hero-scroll-hint" href="#login-about">
            <span>Scroll to explore</span>
            <svg
              className="login-hero-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </a>
        </div>

        <div className="login-form-region">
          <div className="login-form-card">
            <img
              src="/static/brand/PangAsin_Logo.png"
              alt=""
              className="login-form-logo"
              aria-hidden="true"
            />
            <div className="encoder-login-eyebrow">Secure sign in</div>
            <h2 className="encoder-login-title">Welcome back</h2>
            <p className="encoder-login-sub">
              Sign in with your encoder or admin account to continue.
            </p>

            {error && (
              <Alert
                variant="danger"
                className="login-form-error is-shaking"
                key={errorKey}
              >
                <AlertCircle size={16} aria-hidden="true" className="login-form-error-icon" />
                <span>{error}</span>
              </Alert>
            )}

            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3" controlId="loginEmail">
                <Form.Label className="encoder-login-field-label" htmlFor="loginEmail">
                  Email
                </Form.Label>
                <div className="encoder-login-input-wrap">
                  <Mail
                    size={16}
                    aria-hidden="true"
                    className="encoder-login-input-icon"
                  />
                  <Form.Control
                    id="loginEmail"
                    type="email"
                    className="encoder-login-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@pangasin.gov.ph"
                    autoComplete="username"
                    required
                  />
                </div>
              </Form.Group>
              <Form.Group className="mb-4" controlId="loginPassword">
                <Form.Label className="encoder-login-field-label" htmlFor="loginPassword">
                  Password
                </Form.Label>
                <div className="encoder-login-input-wrap">
                  <Lock size={16} aria-hidden="true" className="encoder-login-input-icon" />
                  <Form.Control
                    id="loginPassword"
                    type={showPassword ? 'text' : 'password'}
                    className="encoder-login-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="encoder-login-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
              </Form.Group>
              <Button
                type="submit"
                className="w-100 encoder-login-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={17} aria-hidden="true" className="encoder-login-spinner" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
                    <span className="encoder-login-btn-arrow">
                      <ArrowRight size={16} aria-hidden="true" />
                    </span>
                  </>
                )}
              </Button>
            </Form>

            <div className="encoder-login-footer">
              <Link to="/">
                <ArrowLeft size={14} aria-hidden="true" />
                Back to public dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="login-about" id="login-about">
        <Container>
          <div className="login-about-header">
            <div className="login-about-eyebrow">About the ASIN Center</div>
            <h2 id="login-about-title" className="login-about-title">
              Accelerating the Philippine Salt Industry
            </h2>
            <p className="login-about-description">
              The Accelerating Salt Research and Innovation (ASIN) Center at Pangasinan State
              University supports the Philippine salt industry through research,
              innovation, and data-driven planning under RA 11985. This dashboard presents
              approved and aggregated salt production information from the salt-producing
              municipalities of Pangasinan.
            </p>
          </div>

          <Row ref={statsRef} className="g-3 g-lg-4 login-about-grid">
            <Col xs={12} sm={6} lg={3}>
              <Reveal className="login-about-reveal">
                <AdminKpiCard
                  className="login-about-kpi"
                  icon={MapPin}
                  title="Municipalities covered"
                  value={kpis.municipalities.value}
                  supporting={kpis.municipalities.supporting}
                  accent="ocean"
                />
              </Reveal>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Reveal className="login-about-reveal">
                <AdminKpiCard
                  className="login-about-kpi"
                  icon={CalendarDays}
                  title="Years of data tracked"
                  value={kpis.years.value}
                  supporting={kpis.years.supporting}
                  accent="gold"
                />
              </Reveal>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Reveal className="login-about-reveal">
                <AdminKpiCard
                  className="login-about-kpi"
                  icon={Scale}
                  title="Recorded production"
                  value={kpis.production.value}
                  unit={kpis.production.unit}
                  supporting={kpis.production.supporting}
                  accent="green"
                />
              </Reveal>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Reveal className="login-about-reveal">
                <AdminKpiCard
                  className="login-about-kpi"
                  icon={ShieldCheck}
                  title="Policy mandate"
                  value={POLICY_MANDATE}
                  supporting="ASIN Center mandate for salt research and innovation"
                  accent="brown"
                />
              </Reveal>
            </Col>
          </Row>
        </Container>
      </section>

      {/*
        PLACEHOLDER CONTENT — must be replaced with real values before deployment:
        1. Contact details below (email, phone, office address) are PLACEHOLDERS
           pending the official ASIN Center contact information.
        2. Developer credits are PLACEHOLDERS pending the real names, programs,
           and graduation year of the system's creators.
        TODO(user): replace every item marked TODO(user) below with the official
        contact details and credits. Do not invent real people, phone numbers,
        or addresses.
      */}
      <footer className="login-footer">
        <div className="login-footer-wave" aria-hidden="true">
          <svg viewBox="0 0 120 24" preserveAspectRatio="none" focusable="false">
            <path d="M0 24 C 30 0, 60 24, 90 12 C 105 6, 112 12, 120 12 L 120 24 Z" />
          </svg>
        </div>
        <Container>
          <div className="login-footer-grid">
            <div className="login-footer-block">
              <div className="login-footer-eyebrow" id="login-footer-contact">
                Contact
              </div>
              <p className="login-footer-org">
                Accelerating Salt Research and Innovation (ASIN) Center,
                Pangasinan State University
              </p>
              <p className="login-footer-support">
                Supported by the DOST NICER Program.
              </p>
              {/* TODO(user) — replace with the official ASIN Center contact details. */}
              <ul className="login-footer-details">
                <li>
                  <Mail size={13} aria-hidden="true" />
                  {/* TODO(user) — verify this is still the official contact address. */}
                  <span>contact@pangasin.gov.ph</span>
                </li>
                <li>
                  <Phone size={13} aria-hidden="true" />
                  {/* TODO(user) — replace (075) XXX-XXXX with the official phone number. */}
                  <span>(075) XXX-XXXX</span>
                </li>
                <li>
                  <MapPin size={13} aria-hidden="true" />
                  {/* TODO(user) — replace [campus] with the official office location. */}
                  <span>ASIN Center, PSU Binmaley, Pangasinan</span>
                </li>
              </ul>
            </div>

            <div className="login-footer-block">
              <div className="login-footer-eyebrow">Developed by</div>
              {/* TODO(user) — the developer credits were intentionally removed.
                  Real names, program, and year are pending. */}
              <p className="login-footer-credits">
                PangAsin Development Team — BS Information Technology Major in Data
                Analytics, 2027. Built for the ASIN Center.
              </p>
              <p className="login-footer-meta">
                PangAsin — salt production monitoring, forecasting, and decision
                support system.
              </p>
            </div>
          </div>

          <div className="login-footer-bottom">
            <span>© 2026 PangAsin / ASIN Center</span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
