import os
import tempfile

# Must run before `app` is imported so the DB and audio dir are isolated.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="clinicscribe-test-")
os.environ["API_KEY"] = ""
