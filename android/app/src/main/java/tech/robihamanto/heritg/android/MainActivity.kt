package tech.robihamanto.heritg.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import tech.robihamanto.heritg.android.core.data.FamilyRepository

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = (application as HeritgApplication).familyRepository
        setContent { HeritgApp(repository) }
    }
}

private val Ink = Color(0xFF20342E)
private val Moss = Color(0xFF476B58)
private val Paper = Color(0xFFF4EFE4)
private val Card = Color(0xFFFFFCF4)

@Composable
private fun HeritgApp(repository: FamilyRepository) {
    val colors = lightColorScheme(primary = Moss, onPrimary = Color.White, background = Paper, surface = Card)
    MaterialTheme(colorScheme = colors, typography = MaterialTheme.typography) {
        Surface(modifier = Modifier.fillMaxSize(), color = Paper) { Home(repository) }
    }
}

@Composable
private fun Home(repository: FamilyRepository) {
    val treeCount by repository.observeTreeCount().collectAsStateWithLifecycle(initialValue = 0)
    val scope = rememberCoroutineScope()
    val sampleTreeName = stringResource(R.string.sample_tree_name)
    Box(
        modifier = Modifier.fillMaxSize().background(Paper).padding(horizontal = 24.dp, vertical = 32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.app_name),
                color = Ink,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold,
                fontSize = 42.sp,
                letterSpacing = 4.sp,
            )
            Text(stringResource(R.string.app_tagline), color = Moss, fontSize = 16.sp)
            Spacer(Modifier.height(32.dp))
            Column(
                modifier = Modifier.fillMaxWidth().background(Card, RoundedCornerShape(24.dp)).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    pluralStringResource(R.plurals.tree_count, treeCount, treeCount),
                    color = Ink,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.empty_state), color = Moss)
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { scope.launch { repository.createTree(sampleTreeName) } },
                    colors = ButtonDefaults.buttonColors(containerColor = Moss),
                    enabled = treeCount == 0,
                ) { Text(stringResource(R.string.create_tree)) }
            }
        }
    }
}
