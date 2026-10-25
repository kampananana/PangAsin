// WHAT: Glass split-screen login page na may salt background at normal na
//      layout. Ang hero ay 100% viewport na may salt_bg.jpg mismo (walang
//      rotate/parallax), at naka-flex ang dalawang kolumna (copy sa kaliwa,
//      login card sa kanan). Naka-scope sa .login-* na mga klase para hindi
//      epekto sa ibang pages (encoder, admin, at guest dashboard).

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Container, Form } from 'react-bootstrap';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, MapPin, Phone } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Reveal from './Reveal';
import { loadPublicDashboardData, loginAPI, getMunicipalityProduction } from '../services/dataService';
import { useToast } from './Toast';

import dasolLogo from '../assets/dasol.png';
import infantaLogo from '../assets/infanta.png';
import andaLogo from '../assets/anda.png';
import bolinaoLogo from '../assets/bolinao.png';
import alaminosLogo from '../assets/alaminos.png';
import baniLogo from '../assets/bani.png';
import sanFabianLogo from '../assets/sanfabian.png';

const MUNICIPALITIES = [
  { name: 'Dasol', logo: dasolLogo },
  { name: 'Infanta', logo: infantaLogo },
  { name: 'Anda', logo: andaLogo },
  { name: 'Bolinao', logo: bolinaoLogo },
  { name: 'Alaminos', logo: alaminosLogo },
  { name: 'Bani', logo: baniLogo },
  { name: 'San Fabian', logo: sanFabianLogo },
];

function normalizeMunicipalityName(name) {
  if (!name) return '';
  return name.toString().toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
}

function formatMunicipalityVolume(volume) {
  if (volume === null || volume === undefined || Number.isNaN(Number(volume))) {
    return 'No data yet';
  }
  return Number(volume).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' MT';
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [municipalityVolumes, setMunicipalityVolumes] = useState({});
  const [municipalityDataLoading, setMunicipalityDataLoading] = useState(true);
  const [municipalityDataError, setMunicipalityDataError] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const navigate = useNavigate();
  const { toastSuccess } = useToast();

  const heroRef = useRef(null);
  const statsRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHeroReady(true);
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;

    loadPublicDashboardData()
      .then(() => {
        if (!active) return;
        try {
          const productions = getMunicipalityProduction();
          const map = {};
          productions.forEach((m) => {
            const key = normalizeMunicipalityName(m.name);
            if (key) {
              map[key] = m.productionMT;
            }
          });
          setMunicipalityVolumes(map);
        } catch (err) {
          setMunicipalityDataError(true);
        } finally {
          if (active) setMunicipalityDataLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setMunicipalityDataError(true);
          setMunicipalityDataLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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
        <div className="login-hero-row">
          <div className="login-hero-copy">
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
          </div>

          <div className="login-form-card">
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
                    size={18}
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
                  <Lock size={18} aria-hidden="true" className="encoder-login-input-icon" />
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

          <a className="login-hero-scroll-hint" href="#login-about">
            <span>Scroll to explore</span>
            <svg
              className="login-hero-chevron"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </a>
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

          <div ref={statsRef} className="login-municipality-grid">
            {MUNICIPALITIES.map((municipality) => {
              const key = normalizeMunicipalityName(municipality.name);
              const volume = municipalityVolumes[key];
              const volumeDisplay = municipalityDataLoading && !municipalityDataError ? 'Loading...' : formatMunicipalityVolume(volume);
              return (
                <Reveal key={municipality.name} className="login-municipality-reveal">
                  <div className="login-municipality-card">
                    <div className="login-municipality-logo-wrap">
                      <img
                        src={municipality.logo}
                        alt={municipality.name + ' logo'}
                        className="login-municipality-logo"
                      />
                    </div>
                    <div className="login-municipality-name">{municipality.name}</div>
                    <div className="login-municipality-volume">{volumeDisplay}</div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      <footer className="login-footer">
        <Container>
          <div className="login-footer-grid">
            <div className="login-footer-block">
              <div className="login-footer-eyebrow">Contact</div>
              <p className="login-footer-aside">
                <span className="login-footer-aside-title">Accelerating Salt Research and Innovation (ASIN) Center</span>
                <br />
                <span className="login-footer-aside-line">Pangasinan State University</span>
                <br />
                <span className="login-footer-aside-line">DOST NICER Program</span>
              </p>
              <ul className="login-footer-details">
                <li>
                  <Mail size={18} aria-hidden="true" className="login-footer-icon" />
                  <a
                    href="mailto:contact@pangasin.gov.ph"
                    className="login-footer-contact-link"
                  >
                    contact@pangasin.gov.ph <span className="login-footer-placeholder">(placeholder)</span>
                  </a>
                </li>
                <li>
                  <Phone size={18} aria-hidden="true" className="login-footer-icon" />
                  <span>(075) XXX-XXXX <span className="login-footer-placeholder">(placeholder)</span></span>
                </li>
                <li>
                  <MapPin size={18} aria-hidden="true" className="login-footer-icon" />
                  <span>ASIN Center, PSU Binmaley, Pangasinan <span className="login-footer-placeholder">(placeholder address)</span></span>
                </li>
              </ul>
            </div>

            <div className="login-footer-block">
              <div className="login-footer-eyebrow">Developed by</div>
              <p className="login-footer-credits">
                <span className="login-footer-dev-name">[System Creator Name 1]</span>,{" "}
                <span className="login-footer-dev-name">[System Creator Name 2]</span>{" "}
                <span className="login-footer-placeholder">(placeholder)</span>
                <br />
                BS Information Technology, Major in Data Analytics
                <br />
                Pangasinan State University
              </p>
              <p className="login-footer-meta">Built for the ASIN Center</p>
            </div>
          </div>

          <div className="login-footer-bottom">
            <div className="login-footer-bottom-row">
              <span className="login-footer-copyright">
                © 2026 ASIN Center, Pangasinan State University
              </span>
              <span className="login-footer-policy">RA 11985</span>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
