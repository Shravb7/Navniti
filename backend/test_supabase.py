import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()

def test_connection():
    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    print("=" * 60)
    print(" NAVNITI SUPABASE / POSTGRES DIAGNOSTICS")
    print("=" * 60)
    
    if not db_url:
        print("[WARNING] No DATABASE_URL or SUPABASE_DB_URL found in your .env file.")
        print("          Currently falling back to local SQLite database: navniti.db")
        print("\nTo connect to Supabase:")
        print("1. Create a project at https://supabase.com")
        print("2. Copy the PostgreSQL connection string (Transaction Mode or Session Mode)")
        print("3. Paste it as DATABASE_URL=your_connection_string in backend/.env")
        print("=" * 60)
        return
        
    print(f"[*] Detected database URL: {db_url[:15]}...{db_url[-25:] if len(db_url) > 40 else ''}")
    print("[*] Attempting connection via SQLAlchemy and psycopg2...")
    
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            row = result.fetchone()
            print("\n[SUCCESS] Connected to database server successfully!")
            print(f"[INFO] Server Version: {row[0]}")
            
            # Count seeded wards
            try:
                wards_count = conn.execute(text("SELECT count(*) FROM wards;")).fetchone()[0]
                print(f"[INFO] Seeded Wards in Database: {wards_count}")
            except Exception:
                print("[INFO] Tables do not exist yet. Run 'python main.py' to initialize them.")
                
    except Exception as e:
        print("\n[ERROR] Connection failed!")
        print("-" * 60)
        print(f"Error detail:\n{e}")
        print("-" * 60)
        print("\nPlease verify:")
        print("1. Your password is correct (and does not contain unescaped special characters like '@')")
        print("2. Your connection string allows external connections (check Supabase network settings)")
        print("3. You have internet connectivity")
        
    print("=" * 60)

if __name__ == "__main__":
    test_connection()
