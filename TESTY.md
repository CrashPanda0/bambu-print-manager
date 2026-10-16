# Weryfikacja MVP

Wykonano 16.10.2026 w środowisku Node.js 24.

## Wyniki

- `node --test tests/*.test.mjs`: 32 testów, 32 zaliczonych, 0 błędów.
- TypeScript: `tsc --noEmit` — zaliczony.
- Kompilacja produkcyjna Sites/Vinext — zaliczona.
- HTML: unikalne identyfikatory, język polski, viewport mobilny, wszystkie pola formularzy mają etykietę, wszystkie lokalne zasoby istnieją.
- Compose: struktura YAML sprawdzona, ścieżki w Dockerfile zgodne z paczką.

## Sprawdzone scenariusze

Rzeczywista baza SQLite i rzeczywiste pliki lokalne; pełny proces przez API: konfiguracja administratora, konta operatora i dwóch pracowników, sesje, zgłoszenie, załączniki STL/PDF/PNG, pobranie identycznych bajtów, miniatura (nagłówki obrazu), przypisanie drukarki i operatora, rezerwacja, zapis profilu/czasu/filamentu/notatek, rozpoczęcie druku, kontrola jakości, odbiór, zakończenie i historia.

Zweryfikowano odmowę dostępu anonimowego, izolację zgłoszeń i plików pomiędzy pracownikami, uprawnienia operatora/administratora, fałszywe nagłówki tożsamości w LAN, blokadę formularzy z innej domeny, błędne hasło, niedozwolone linki/pliki, opcjonalne i niepełne wymiary, limit rozmiaru pliku, konflikt wersji, kolizję rezerwacji, dozwolone stykające terminy, blokadę dwóch równoległych wydruków, gotowość drukarki, ochronę ostatniego administratora i operatora trwającego wydruku. Baza, sesje, notatki i pliki przetrwały zamknięcie i ponowne otwarcie.

Dodatkowy test uruchamia rzeczywisty serwer HTTP na losowym porcie loopback, pobiera stronę i zasoby, tworzy administratora i odczytuje flotę przez HTTP. Sprawdzono także autoryzację trybu Sites i domyślną rolę kolejnych użytkowników.

## Zakres niezweryfikowany

Środowisko nie udostępnia obsługiwanego podglądu przeglądarkowego ani silnika Docker. Nie wykonano wizualnego testu na komputerze/tablecie, rzeczywistego przeciągania Kanban ani `docker compose up`. Test HTTP wykonuje ten sam backend uruchamiany w obrazie Docker; Compose i Dockerfile są przygotowane do uruchomienia, ale sam obraz nie został tutaj zbudowany. Uruchomienie LAN wymaga komputera użytkownika.

Testy integracyjne używają adaptera SQLite; powiązania D1 i R2 wersji online sprawdza kompilacja oraz wdrożenie Sites. Pliki testowe i baza testowa są tymczasowe i nie trafiają do danych użytkownika.


Wersja 1.1: dodano test całego cyklu zlecenia bez wymiarów, utworzenie trzech administratorów, pracę i usuwanie przez innych administratorów, odmowę usuwania dla pracownika/operatora i osoby anonimowej, konflikt wersji, blokadę usuwania trwającego druku, usunięcie historii oraz fizycznych załączników. Testy używają wyłącznie tymczasowych danych. Nowe menu i wybór zbiorczy sprawdzono statycznie; nie wykonano interakcji w przeglądarce.

Sprawdzono HTTP za reverse proxy z APP_ORIGIN, poprawne przyjęcie formularza HTTPS i ciasteczko Secure.
